/**
 * In-memory token-bucket rate limiter keyed by API key id.
 *
 * Production note: this lives in-process, so each serverless instance
 * gets its own bucket. Good enough for MVP + fast-failing abusive
 * clients, but for correctness across instances we should move this
 * to Redis (Upstash, etc.) behind the same interface.
 *
 * TODO: replace with a Redis-backed limiter once we pick a provider.
 */

interface Bucket {
  tokens: number;
  updatedAtMs: number;
}

export interface RateLimitOptions {
  /** Tokens per second refill rate. */
  refillPerSecond?: number;
  /** Bucket capacity (burst). */
  capacity?: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
  remaining: number;
  limit: number;
}

const DEFAULT_CAPACITY = 60;
const DEFAULT_REFILL_PER_SECOND = 1; // 60 rpm sustained, 60 burst.

const buckets = new Map<string, Bucket>();

export function rateLimit(
  apiKeyId: string,
  opts: RateLimitOptions = {},
): RateLimitResult {
  const capacity = opts.capacity ?? DEFAULT_CAPACITY;
  const refillPerSecond = opts.refillPerSecond ?? DEFAULT_REFILL_PER_SECOND;
  const now = Date.now();

  const existing = buckets.get(apiKeyId);
  const bucket: Bucket = existing ?? { tokens: capacity, updatedAtMs: now };

  const elapsedSeconds = (now - bucket.updatedAtMs) / 1000;
  const refilled = Math.min(capacity, bucket.tokens + elapsedSeconds * refillPerSecond);

  if (refilled >= 1) {
    const next = { tokens: refilled - 1, updatedAtMs: now };
    buckets.set(apiKeyId, next);
    return {
      ok: true,
      retryAfterMs: 0,
      remaining: Math.floor(next.tokens),
      limit: capacity,
    };
  }

  const deficit = 1 - refilled;
  const retryAfterMs = Math.ceil((deficit / refillPerSecond) * 1000);
  buckets.set(apiKeyId, { tokens: refilled, updatedAtMs: now });
  return { ok: false, retryAfterMs, remaining: 0, limit: capacity };
}
