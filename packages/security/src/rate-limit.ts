/**
 * Rate limiting.
 *
 * Two backends:
 *   - Upstash (Redis-backed, durable across serverless instances) when
 *     `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set.
 *   - In-memory token bucket as a fallback for local dev and for tests.
 *
 * Both expose the same `RateLimiter` interface so call sites don't need
 * to branch.
 *
 * We resolve `@upstash/ratelimit` and `@upstash/redis` dynamically so
 * this file typechecks without `pnpm install`. The runtime import is
 * wrapped in try/catch — if the packages aren't available we quietly
 * fall back to the in-memory limiter and log a warning via the caller-
 * supplied `onFallback` hook (if any).
 */

// -----------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------

export interface RateLimitResult {
  success: boolean;
  /** Seconds until the client should retry. Only set when !success. */
  retryAfter?: number;
  /** Remaining requests in the current window. */
  remaining?: number;
  /** Unix ms at which the current window resets. */
  reset?: number;
}

export interface RateLimiter {
  limit(identifier: string): Promise<RateLimitResult>;
}

export type RateLimitKind =
  | "chat"
  | "image"
  | "video"
  | "music"
  | "browser"
  | "phone"
  | "api";

export interface UpstashOptions {
  url?: string;
  token?: string;
  prefix?: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

// -----------------------------------------------------------------------
// Per-feature caps
// -----------------------------------------------------------------------
// Conservative defaults sized for a single user on the free tier. Paid
// tiers should override these via `rateLimitFor`'s optional overrides or
// at the route handler layer where the user's entitlements are known.

interface KindConfig {
  limit: number;
  windowSec: number;
  prefix: string;
}

const KIND_CONFIG: Record<RateLimitKind, KindConfig> = {
  chat:    { limit: 60,  windowSec: 60, prefix: "rl:chat" },
  image:   { limit: 20,  windowSec: 60, prefix: "rl:image" },
  video:   { limit: 5,   windowSec: 60, prefix: "rl:video" },
  music:   { limit: 10,  windowSec: 60, prefix: "rl:music" },
  browser: { limit: 15,  windowSec: 60, prefix: "rl:browser" },
  phone:   { limit: 10,  windowSec: 60, prefix: "rl:phone" },
  api:     { limit: 120, windowSec: 60, prefix: "rl:api" },
};

// -----------------------------------------------------------------------
// In-memory token bucket
// -----------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;

function createMemoryLimiter(opts: { limit: number; windowSec: number; prefix: string }): RateLimiter {
  const windowMs = opts.windowSec * 1000;
  const buckets = new Map<string, Bucket>();

  return {
    async limit(identifier: string): Promise<RateLimitResult> {
      const key = `${opts.prefix}:${identifier}`;
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;

      // Opportunistic LRU eviction — Map iteration preserves insertion
      // order so the first key is the oldest.
      if (buckets.size > MAX_BUCKETS) {
        const firstKey = buckets.keys().next().value;
        if (firstKey !== undefined) buckets.delete(firstKey);
      }

      const remaining = Math.max(0, opts.limit - bucket.count);
      if (bucket.count > opts.limit) {
        return {
          success: false,
          retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
          remaining: 0,
          reset: bucket.resetAt,
        };
      }
      return { success: true, remaining, reset: bucket.resetAt };
    },
  };
}

// -----------------------------------------------------------------------
// Upstash limiter (lazy-loaded)
// -----------------------------------------------------------------------
// We keep the Upstash types loose so this module compiles without the
// packages installed. At runtime we import by string so Next.js' Edge
// bundler includes them only when they're actually needed.

type UpstashRatelimitLike = {
  limit: (id: string) => Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
};

type UpstashCtors = {
  Ratelimit: new (args: {
    redis: unknown;
    limiter: unknown;
    prefix?: string;
    analytics?: boolean;
  }) => UpstashRatelimitLike;
  slidingWindow: (tokens: number, window: string) => unknown;
  Redis: new (args: { url: string; token: string }) => unknown;
};

let cachedUpstash: UpstashCtors | null | undefined;

async function loadUpstash(): Promise<UpstashCtors | null> {
  if (cachedUpstash !== undefined) return cachedUpstash;
  try {
    // String-form dynamic imports — resolved at runtime, not at bundle time.
    const rlModName = "@upstash/ratelimit";
    const redisModName = "@upstash/redis";
    const rlMod = (await import(/* @vite-ignore */ rlModName)) as {
      Ratelimit: UpstashCtors["Ratelimit"] & { slidingWindow: UpstashCtors["slidingWindow"] };
    };
    const redisMod = (await import(/* @vite-ignore */ redisModName)) as {
      Redis: UpstashCtors["Redis"];
    };
    cachedUpstash = {
      Ratelimit: rlMod.Ratelimit,
      slidingWindow: rlMod.Ratelimit.slidingWindow,
      Redis: redisMod.Redis,
    };
  } catch {
    cachedUpstash = null;
  }
  return cachedUpstash;
}

/**
 * Create a rate limiter backed by Upstash Redis if configured, otherwise
 * an in-memory token bucket with the same interface.
 *
 * The returned limiter is a singleton-friendly object — safe to cache at
 * module scope for the lifetime of the process / edge isolate.
 */
export function createUpstashRateLimiter(opts: UpstashOptions): RateLimiter {
  const url = opts.url ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = opts.token ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  const prefix = opts.prefix ?? "rl";

  if (!url || !token) {
    return createMemoryLimiter({ limit: opts.limit, windowSec: opts.windowSec, prefix });
  }

  // Build the real limiter lazily on first call to avoid paying the
  // import cost if the route is never hit. Until the async load resolves
  // we serve requests from the in-memory fallback so we never block.
  const memory = createMemoryLimiter({ limit: opts.limit, windowSec: opts.windowSec, prefix });
  let real: RateLimiter | null = null;
  let loading: Promise<void> | null = null;

  const ensure = (): Promise<void> => {
    if (real || loading) return loading ?? Promise.resolve();
    loading = (async () => {
      const mod = await loadUpstash();
      if (!mod) return; // fallback stays in use
      const redis = new mod.Redis({ url, token });
      const rl = new mod.Ratelimit({
        redis,
        limiter: mod.slidingWindow(opts.limit, `${opts.windowSec} s`),
        prefix,
        analytics: false,
      });
      real = {
        async limit(identifier: string): Promise<RateLimitResult> {
          const r = await rl.limit(identifier);
          const retryAfter = r.success
            ? undefined
            : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
          return {
            success: r.success,
            retryAfter,
            remaining: r.remaining,
            reset: r.reset,
          };
        },
      };
    })();
    return loading;
  };

  return {
    async limit(identifier: string): Promise<RateLimitResult> {
      void ensure(); // fire-and-forget warm-up
      if (real) return real.limit(identifier);
      return memory.limit(identifier);
    },
  };
}

// -----------------------------------------------------------------------
// rateLimitFor — per-feature factory
// -----------------------------------------------------------------------

const limiterCache = new Map<RateLimitKind, RateLimiter>();

/**
 * Returns a `(identifier) => Promise<RateLimitResult>` function for the
 * given feature. The underlying limiter is cached per-kind so repeated
 * calls from route handlers share a single Redis client.
 */
export function rateLimitFor(
  kind: RateLimitKind,
): (identifier: string) => Promise<RateLimitResult> {
  let limiter = limiterCache.get(kind);
  if (!limiter) {
    const cfg = KIND_CONFIG[kind];
    limiter = createUpstashRateLimiter({
      prefix: cfg.prefix,
      limit: cfg.limit,
      windowSec: cfg.windowSec,
    });
    limiterCache.set(kind, limiter);
  }
  return (identifier: string) => limiter!.limit(identifier);
}
