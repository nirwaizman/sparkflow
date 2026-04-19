/**
 * @sparkflow/security — surface barrel.
 *
 * Keep this file import-free of heavyweight side effects. Sub-path
 * imports (`@sparkflow/security/rate-limit` etc.) are preferred in Edge
 * code paths where bundle size matters.
 */

export {
  sanitizeInjection,
  scanForInjection,
  INJECTION_PATTERNS,
  type InjectionPattern,
  type InjectionScan,
} from "./prompt-injection";

export {
  createUpstashRateLimiter,
  rateLimitFor,
  type RateLimiter,
  type RateLimitResult,
  type RateLimitKind,
  type UpstashOptions,
} from "./rate-limit";

export {
  buildCSP,
  generateNonce,
  getCSPHeaderName,
  type BuildCSPOptions,
} from "./csp";

export { hashSecret, redact, isSensitiveKey } from "./secrets";
