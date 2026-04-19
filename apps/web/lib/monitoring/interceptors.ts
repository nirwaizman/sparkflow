/**
 * Route-level monitoring interceptors.
 *
 * `withMonitor(name, handler)` wraps a Next.js App Router route handler
 * (or any `(req, ctx?) => Promise<Response>`) and records:
 *
 *   - Latency into the SLO sliding-window buffer (`recordLatency`).
 *   - Error count on any thrown exception or non-2xx response
 *     (`recordError` + `captureError`).
 *   - An `x-monitor` response header containing the metric name and
 *     observed latency, useful for client-side debugging and for
 *     correlating Vercel access logs with our SLO snapshot.
 *
 * This is an optional upgrade path — routes are not required to use it.
 * As an example it is attached today to three critical handlers:
 *   - POST /api/chat/stream
 *   - POST /api/image/generate
 *   - POST /api/agents/[id]/run
 */

import type { NextRequest } from "next/server";
import {
  captureError,
  logger,
  recordError,
  recordLatency,
} from "@sparkflow/observability";

/**
 * Generic shape of a Next.js App Router handler. Context is an opaque
 * `{ params: Promise<T> }` — we pass it through untouched so dynamic
 * segments (e.g. `/api/agents/[id]/run`) keep working.
 */
export type MonitoredHandler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx,
) => Promise<Response> | Response;

export interface WithMonitorOptions {
  /** If true, don't mutate response headers. Default: false. */
  skipHeaders?: boolean;
  /**
   * Custom classifier — return true to count the response as an error.
   * Defaults to `res.status >= 500`; 4xx responses are treated as
   * client errors and do not count against the service SLO.
   */
  isError?: (res: Response) => boolean;
}

function defaultIsError(res: Response): boolean {
  return res.status >= 500;
}

/**
 * Wrap a route handler so every invocation records latency + errors to
 * the observability SLO buffers.
 *
 * @example
 * export const POST = withMonitor("api.chat.stream", async (req) => { ... })
 */
export function withMonitor<Ctx = unknown>(
  name: string,
  handler: MonitoredHandler<Ctx>,
  opts: WithMonitorOptions = {},
): MonitoredHandler<Ctx> {
  const isError = opts.isError ?? defaultIsError;

  return async (req, ctx) => {
    const start = performance.now();
    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      recordLatency(name, latencyMs);
      recordError(name);
      captureError(err, { route: name, latencyMs });
      logger.error(
        {
          route: name,
          latencyMs,
          err: err instanceof Error ? err.message : String(err),
        },
        "monitor.handler.threw",
      );
      throw err;
    }

    const latencyMs = Math.round(performance.now() - start);
    recordLatency(name, latencyMs);
    if (isError(res)) {
      recordError(name);
      logger.warn(
        { route: name, latencyMs, status: res.status },
        "monitor.handler.error_status",
      );
    }

    if (opts.skipHeaders) return res;

    // Response headers may be immutable when returned from NextResponse
    // with a pre-built ReadableStream body (e.g. SSE). Guard the mutation
    // so we don't turn a monitoring annotation into a 500.
    try {
      res.headers.set("x-monitor", `${name};t=${latencyMs}`);
    } catch {
      // Immutable headers — silently skip.
    }
    return res;
  };
}

/**
 * Small helper for code paths that aren't full handlers — e.g. a
 * database call deep inside business logic that we still want on the
 * SLO dashboard. Records latency regardless of outcome; only records
 * an error when the function throws.
 */
export async function monitorSection<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    const out = await fn();
    recordLatency(name, Math.round(performance.now() - start));
    return out;
  } catch (err) {
    recordLatency(name, Math.round(performance.now() - start));
    recordError(name);
    throw err;
  }
}
