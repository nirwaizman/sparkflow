/**
 * Next.js instrumentation hook — see
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * `register()` is invoked once at process start for each Next runtime
 * (nodejs + edge). We only initialise Sentry / Langfuse on the Node runtime,
 * where those SDKs are designed to run.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Sentry — dynamic import to avoid pulling the SDK into the edge bundle.
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      await import("./sentry.server.config");
    } catch (err) {
      console.warn(
        "[instrumentation] failed to load sentry.server.config:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Langfuse — the observability package initialises lazily on first use, but
  // we warm the singleton here so the first user request does not pay for SDK
  // load.
  try {
    const { initLangfuse, captureError, logger } = await import(
      "@sparkflow/observability"
    );
    initLangfuse();

    const onUnhandled = (reason: unknown): void => {
      captureError(reason, { source: "unhandledRejection" });
    };
    const onUncaught = (err: unknown): void => {
      captureError(err, { source: "uncaughtException" });
    };

    process.on("unhandledRejection", onUnhandled);
    process.on("uncaughtException", onUncaught);

    logger.info(
      {
        nodeEnv: process.env.NODE_ENV,
        sentry: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
        langfuse: Boolean(process.env.LANGFUSE_PUBLIC_KEY),
        posthog: Boolean(process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY),
      },
      "instrumentation.register",
    );
  } catch (err) {
    console.warn(
      "[instrumentation] observability bootstrap failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
