/**
 * @sparkflow/public-api — public API surface.
 *
 * Consumers (apps/web route handlers, first-party SDK, docs generators)
 * import the pieces they need by named import. Deep submodule imports
 * are also supported via the `exports` map in package.json.
 */
export { generateApiKey, verifyApiKey, hashKey, extractKey } from "./auth";
export type { VerifiedApiKey } from "./auth";
export { SparkFlow } from "./sdk/client";
export type { SparkFlowOptions } from "./sdk/client";
export { buildOpenApiSpec } from "./openapi";
export { signWebhook, verifyWebhookSignature, WEBHOOK_SIGNATURE_HEADER } from "./webhooks/sign";
