/**
 * Public surface of @sparkflow/observability.
 *
 * Import from "@sparkflow/observability" rather than reaching into
 * individual submodules — subpaths exist only for tree-shaken edge bundles.
 */

export { logger } from "./logger";
export type { Logger } from "./logger";

export { initLangfuse, withLlmTrace, traceToolCall } from "./langfuse";
export type { LlmTraceMetadata } from "./langfuse";

export { captureError, captureMessage } from "./sentry";

export { trackEvent, shutdownPostHog } from "./posthog";

export { incr, observe, snapshot, __resetMetrics } from "./metrics";
export type { MetricLabels, MetricsSnapshot } from "./metrics";
