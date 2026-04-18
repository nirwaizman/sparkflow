/**
 * Sentry browser configuration. This file is loaded by Next.js in the client
 * bundle when `NEXT_PUBLIC_SENTRY_DSN` is set. It is intentionally tiny —
 * sampling rates are conservative so a misconfigured DSN cannot flood the
 * Sentry project with events.
 */

export {};

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  // Dynamic import keeps the SDK out of the bundle when Sentry is disabled.
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development",
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.1,
      });
    })
    .catch((err) => {
      console.warn("[sentry.client] init skipped:", err?.message ?? err);
    });
}
