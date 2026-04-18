/**
 * Sentry server / Node runtime configuration. Invoked from
 * `instrumentation.ts` only when a DSN is present.
 */

export {};

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
        tracesSampleRate: 0.1,
        // Keep default integrations — Next.js-specific ones are auto-enabled.
      });
    })
    .catch((err) => {
      console.warn("[sentry.server] init skipped:", err?.message ?? err);
    });
}
