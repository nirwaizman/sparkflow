/**
 * Shared types for the @sparkflow/crm contacts feature.
 *
 * A Contact represents a person in the org's address book. A
 * ContactActivity is a stubbed reference to a message/meeting/task that
 * touches that contact — the timeline on the detail page renders these.
 *
 * TODO(persistence): migrate the in-memory store in ./store.ts to
 * drizzle-backed `contacts` + `contact_activities` tables, keyed by
 * organizationId. These types are intentionally shaped to match a future
 * row shape (Date fields, string ids) so callers won't need changes.
 */

export type ContactId = string;

export type Contact = {
  id: ContactId;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  /** Optional LLM-inferred industry (populated by enrichContact). */
  industry: string | null;
  /** Free-form notes. */
  notes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ContactActivityKind = "message" | "meeting" | "task";

export type ContactActivity = {
  id: string;
  contactId: ContactId;
  kind: ContactActivityKind;
  /** Short human-readable summary shown in the timeline. */
  summary: string;
  /** Deep link back to the related object (chat thread, meeting, task). */
  link: string | null;
  occurredAt: Date;
};

/** Input payload accepted by `createContact` / `updateContact`. */
export type ContactInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  industry?: string | null;
  notes?: string | null;
  tags?: string[];
};

/** Filters for `listContacts`. */
export type ContactListFilters = {
  organizationId: string;
  /** Free-text substring match over name/email/company. */
  q?: string;
  /** Returns only contacts that carry this tag (exact match, case-insensitive). */
  tag?: string;
  limit?: number;
};
