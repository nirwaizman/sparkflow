/**
 * Public surface of @sparkflow/crm. Call sites should import from
 * "@sparkflow/crm" and never reach into individual modules.
 */

export type {
  Contact,
  ContactActivity,
  ContactActivityKind,
  ContactId,
  ContactInput,
  ContactListFilters,
} from "./types";

export {
  appendActivity,
  bulkTag,
  bulkUpsertContacts,
  createContact,
  deleteContact,
  getContact,
  listActivity,
  listContacts,
  updateContact,
  __resetStoreForTests,
} from "./store";

export { contactsToCsv, parseContactsCsv } from "./import";
export type { CsvRowError, ParseResult } from "./import";

export { enrichContact } from "./enrichment";
export type { EnrichmentPatch, EnrichOptions } from "./enrichment";
