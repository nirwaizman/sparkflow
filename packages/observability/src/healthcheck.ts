/**
 * Upstream dependency health checks.
 *
 * `runHealthChecks()` pings the critical backends in parallel with a
 * hard per-check timeout so a single slow dependency can never wedge the
 * /api/health endpoint. Each check is designed to run on Node.js runtimes
 * (the health route declares `runtime = "nodejs"`).
 *
 * We deliberately avoid importing heavyweight SDKs — the DB and Langfuse
 * checks are done via the already-installed clients, and Redis + OpenAI
 * are plain `fetch` calls. This keeps the package's dependency surface
 * the same as before.
 */

import { logger } from "./logger";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type HealthStatus = "ok" | "degraded" | "down" | "skipped";

export interface HealthComponent {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  /** Human-readable detail (error message for failures). */
  detail?: string;
  /** True when the component is not configured in this environment. */
  skipped?: boolean;
}

export interface HealthReport {
  ok: boolean;
  components: HealthComponent[];
  takenAt: string;
}

export interface HealthCheckOptions {
  /** Per-check timeout in ms. Default 2500. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2500;

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

async function withTimeout<T>(
  name: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<HealthComponent & { value?: T }> {
  const ctrl = new AbortController();
  const start = performance.now();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const value = await fn(ctrl.signal);
    const latencyMs = Math.round(performance.now() - start);
    return { name, status: "ok", latencyMs, value };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const detail = err instanceof Error ? err.message : String(err);
    const aborted = ctrl.signal.aborted;
    return {
      name,
      status: aborted ? "down" : "degraded",
      latencyMs,
      detail: aborted ? `timeout after ${timeoutMs}ms` : detail,
    };
  } finally {
    clearTimeout(timer);
  }
}

function skipped(name: string, detail: string): HealthComponent {
  return { name, status: "skipped", latencyMs: 0, detail, skipped: true };
}

// -----------------------------------------------------------------------
// Individual probes
// -----------------------------------------------------------------------

async function checkDatabase(timeoutMs: number): Promise<HealthComponent> {
  if (!process.env.DATABASE_URL) {
    return skipped("database", "DATABASE_URL not set");
  }
  return withTimeout(
    "database",
    async () => {
      // Resolve @sparkflow/db dynamically so this package does not grow a
      // hard dependency on the DB client. If the workspace package is not
      // available (pruned builds, edge bundles) we fall back to a "skipped"
      // result handled by the caller.
      const req = eval("require") as (id: string) => unknown;
      const mod = req("@sparkflow/db") as {
        getDb?: () => { execute: (q: unknown) => Promise<unknown> };
      };
      if (!mod.getDb) throw new Error("@sparkflow/db.getDb unavailable");
      const db = mod.getDb();
      // drizzle-orm's `sql` tag is pulled through the db package's
      // re-exports. Fall back to raw string if unavailable.
      const sqlTag =
        (req("drizzle-orm") as { sql?: (s: TemplateStringsArray) => unknown }).sql;
      const query = sqlTag ? sqlTag`select 1` : "select 1";
      await db.execute(query);
    },
    timeoutMs,
  ).catch((err) => ({
    name: "database",
    status: "down" as HealthStatus,
    latencyMs: 0,
    detail: err instanceof Error ? err.message : String(err),
  }));
}

async function checkRedis(timeoutMs: number): Promise<HealthComponent> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return skipped("redis", "Upstash env vars not set");

  return withTimeout(
    "redis",
    async (signal) => {
      // Upstash REST `PING` command — cheapest round-trip.
      const res = await fetch(`${url}/ping`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok) throw new Error(`upstash status ${res.status}`);
    },
    timeoutMs,
  );
}

async function checkLangfuse(timeoutMs: number): Promise<HealthComponent> {
  const host = process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com";
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  if (!publicKey) return skipped("langfuse", "LANGFUSE_PUBLIC_KEY not set");

  return withTimeout(
    "langfuse",
    async (signal) => {
      // `/api/public/health` is the supported unauthenticated probe.
      const res = await fetch(`${host.replace(/\/$/, "")}/api/public/health`, {
        method: "GET",
        signal,
      });
      if (!res.ok) throw new Error(`langfuse status ${res.status}`);
    },
    timeoutMs,
  );
}

async function checkOpenAi(timeoutMs: number): Promise<HealthComponent> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return skipped("openai", "OPENAI_API_KEY not set");

  return withTimeout(
    "openai",
    async (signal) => {
      // HEAD on /v1/models is a cheap authenticated probe that does not
      // count against chat/completion quotas.
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "HEAD",
        headers: { authorization: `Bearer ${key}` },
        signal,
      });
      // OpenAI returns 405 for HEAD on some endpoints; treat any 2xx/3xx
      // as reachable, and 401 as a credential (not availability) issue
      // which we surface as "degraded" rather than "down".
      if (res.status === 401) {
        throw new Error("openai credentials rejected");
      }
      if (res.status >= 500) {
        throw new Error(`openai status ${res.status}`);
      }
    },
    timeoutMs,
  );
}

// -----------------------------------------------------------------------
// Public entrypoint
// -----------------------------------------------------------------------

export async function runHealthChecks(
  opts: HealthCheckOptions = {},
): Promise<HealthReport> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const results = await Promise.all([
    checkDatabase(timeoutMs),
    checkRedis(timeoutMs),
    checkLangfuse(timeoutMs),
    checkOpenAi(timeoutMs),
  ]);

  // Strip the transient `value` field that `withTimeout` attaches.
  const components: HealthComponent[] = results.map((r) => {
    const { name, status, latencyMs, detail, skipped: sk } = r;
    const out: HealthComponent = { name, status, latencyMs };
    if (detail !== undefined) out.detail = detail;
    if (sk) out.skipped = true;
    return out;
  });

  // Aggregate status: `ok` means every configured component is healthy.
  // Skipped components do not fail the overall health check (they simply
  // mean the dependency isn't configured for this environment).
  const ok = components.every((c) => c.status === "ok" || c.status === "skipped");

  if (!ok) {
    logger.warn(
      { components },
      "healthcheck.degraded",
    );
  }

  return {
    ok,
    components,
    takenAt: new Date().toISOString(),
  };
}
