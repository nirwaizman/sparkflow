/**
 * @sparkflow/compliance — public API.
 *
 * Surface area:
 *   - moderation: OpenAI moderation check for arbitrary text.
 *   - pii:        regex-based PII detection + redaction for IL locale.
 *   - export:     GDPR/DSAR data export as a ZIP.
 *   - delete:     soft-schedule + hard-execute account deletion.
 */
export { moderateText } from "./moderation";
export type { ModerationResult } from "./moderation";

export { detectPII, redactPII } from "./pii";
export type { PIIMatch, PIIType } from "./pii";

export { exportUserData } from "./export";
export type { ExportManifest, ExportManifestEntry, ExportResult } from "./export";

export {
  requestDeletion,
  executeDeletion,
  getDeletionRequest,
  listDeletionRequests,
  __resetDeletionRequestsForTests,
} from "./delete";
export type {
  DeletionRequest,
  ExecuteDeletionResult,
  RequestDeletionOptions,
  RequestDeletionResult,
} from "./delete";
