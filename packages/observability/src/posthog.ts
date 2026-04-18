/**
 * Server-side PostHog event tracking.
 *
 * Lazily initialises a `posthog-node` client keyed on `POSTHOG_KEY`. All
 * helpers are no-ops if the key is missing — product analytics should never
 * be a hard dependency of the request path.
 */

import { logger } from "./logger";

type PostHogLike = {
  capture: (args: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }) => void;
  shutdown?: () => Promise<void>;
  flush?: () => Promise<void>;
};

let singleton: PostHogLike | null | undefined;

function getClient(): PostHogLike | null {
  if (singleton !== undefined) return singleton;
  const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    singleton = null;
    return singleton;
  }
  try {
    const req = eval("require") as (id: string) => unknown;
    const mod = req("posthog-node") as { PostHog?: new (key: string, opts?: unknown) => PostHogLike };
    if (!mod.PostHog) {
      singleton = null;
      return singleton;
    }
    singleton = new mod.PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
    });
    return singleton;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[posthog] failed to initialise; events dropped",
    );
    singleton = null;
    return singleton;
  }
}

/**
 * Send an event to PostHog. Never throws; never awaits — capture() is
 * designed to be fire-and-forget.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
  distinctId?: string,
): void {
  const client = getClient();
  if (!client) return;
  try {
    client.capture({
      distinctId: distinctId ?? "anonymous",
      event,
      properties,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), event },
      "[posthog] capture failed",
    );
  }
}

/**
 * Flush pending events. Call during graceful shutdown hooks to avoid losing
 * in-flight analytics.
 */
export async function shutdownPostHog(): Promise<void> {
  const client = singleton;
  if (!client) return;
  try {
    if (client.shutdown) await client.shutdown();
    else if (client.flush) await client.flush();
  } catch {
    // ignore
  }
}
