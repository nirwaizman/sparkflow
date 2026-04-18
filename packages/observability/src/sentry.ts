/**
 * Sentry error-reporting bridge.
 *
 * We never import `@sentry/nextjs` eagerly from this module — that package is
 * only installed in the web app and shipping it as a hard dep in a shared
 * library would pull Sentry into every package that ever imports us. Instead
 * we resolve the SDK at call time via dynamic `require`, and degrade to a
 * structured log line when Sentry is not configured or unavailable.
 */

import { logger } from "./logger";

type SentryLike = {
  captureException?: (err: unknown, context?: unknown) => string | undefined;
  captureMessage?: (msg: string, context?: unknown) => string | undefined;
  withScope?: (fn: (scope: unknown) => void) => void;
};

let cached: SentryLike | null | undefined;

function getSentry(): SentryLike | null {
  if (cached !== undefined) return cached;
  // Only attempt to resolve Sentry on the server. `captureError` may be called
  // from edge / browser bundles too, where @sentry/nextjs behaves differently.
  try {
    const req = eval("require") as (id: string) => unknown;
    const mod = req("@sentry/nextjs") as SentryLike;
    if (mod && (mod.captureException || mod.captureMessage)) {
      cached = mod;
      return cached;
    }
    cached = null;
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}

/**
 * Report an error to Sentry when available; otherwise log it with pino.
 * Never throws — this is always safe to call from a `catch` block.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const sentry = getSentry();
  const normalised =
    err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));

  if (sentry?.captureException) {
    try {
      sentry.captureException(normalised, context ? { extra: context } : undefined);
      return;
    } catch (sentryErr) {
      // fall through to logger below
      logger.warn(
        { err: sentryErr instanceof Error ? sentryErr.message : String(sentryErr) },
        "[sentry] captureException failed",
      );
    }
  }

  logger.error(
    {
      err: normalised.message,
      stack: normalised.stack,
      ...context,
    },
    "captureError",
  );
}

/**
 * Capture a named message at an explicit level. Useful for soft failures that
 * aren't exceptions but deserve a Sentry breadcrumb (e.g. degraded route).
 */
export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
): void {
  const sentry = getSentry();
  if (sentry?.captureMessage) {
    try {
      sentry.captureMessage(message, context ? { extra: context } : undefined);
      return;
    } catch {
      // fall through
    }
  }
  logger.info({ ...context }, message);
}
