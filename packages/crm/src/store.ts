/**
 * In-memory store for contacts + per-contact activity.
 *
 * TODO(persistence): replace the `contactsTable` and `activitiesTable`
 * Maps below with drizzle queries against `contacts` and
 * `contact_activities` tables. The public function signatures in this
 * module are the contract — keep them stable so API routes and the UI
 * don't need to change when we swap in the DB.
 *
 * All operations are scoped by `organizationId` to keep the boundary
 * identical to the eventual DB-backed implementation.
 */

import type {
  Contact,
  ContactActivity,
  ContactId,
  ContactInput,
  ContactListFilters,
} from "./types";

// ---------- storage -----------------------------------------------------

const contactsTable = new Map<ContactId, Contact>();
const activitiesTable = new Map<ContactId, ContactActivity[]>();

function uid(prefix: string): string {
  // Deterministic enough for in-memory usage. Swap for `nanoid` once we
  // move to DB.
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normaliseTags(tags: ReadonlyArray<string> | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function matchesFilters(c: Contact, f: ContactListFilters): boolean {
  if (c.organizationId !== f.organizationId) return false;
  if (f.tag) {
    const needle = f.tag.trim().toLowerCase();
    if (needle && !c.tags.includes(needle)) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q) {
      const hay = [c.name, c.email ?? "", c.company ?? "", c.title ?? ""]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }
  return true;
}

// ---------- public API --------------------------------------------------

export async function listContacts(
  filters: ContactListFilters,
): Promise<Contact[]> {
  const limit = filters.limit ?? 200;
  const out: Contact[] = [];
  for (const c of contactsTable.values()) {
    if (matchesFilters(c, filters)) out.push(c);
  }
  out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return out.slice(0, limit);
}

export async function getContact(
  organizationId: string,
  id: ContactId,
): Promise<Contact | null> {
  const row = contactsTable.get(id);
  if (!row || row.organizationId !== organizationId) return null;
  return row;
}

export async function createContact(args: {
  organizationId: string;
  input: ContactInput;
}): Promise<Contact> {
  const now = new Date();
  const contact: Contact = {
    id: uid("ct"),
    organizationId: args.organizationId,
    name: args.input.name.trim(),
    email: args.input.email?.trim() || null,
    phone: args.input.phone?.trim() || null,
    company: args.input.company?.trim() || null,
    title: args.input.title?.trim() || null,
    industry: args.input.industry?.trim() || null,
    notes: args.input.notes?.trim() || null,
    tags: normaliseTags(args.input.tags),
    createdAt: now,
    updatedAt: now,
  };
  contactsTable.set(contact.id, contact);
  return contact;
}

export async function updateContact(args: {
  organizationId: string;
  id: ContactId;
  patch: Partial<ContactInput>;
}): Promise<Contact | null> {
  const existing = contactsTable.get(args.id);
  if (!existing || existing.organizationId !== args.organizationId) return null;
  const next: Contact = {
    ...existing,
    name: args.patch.name !== undefined ? args.patch.name.trim() : existing.name,
    email:
      args.patch.email !== undefined
        ? args.patch.email?.trim() || null
        : existing.email,
    phone:
      args.patch.phone !== undefined
        ? args.patch.phone?.trim() || null
        : existing.phone,
    company:
      args.patch.company !== undefined
        ? args.patch.company?.trim() || null
        : existing.company,
    title:
      args.patch.title !== undefined
        ? args.patch.title?.trim() || null
        : existing.title,
    industry:
      args.patch.industry !== undefined
        ? args.patch.industry?.trim() || null
        : existing.industry,
    notes:
      args.patch.notes !== undefined
        ? args.patch.notes?.trim() || null
        : existing.notes,
    tags:
      args.patch.tags !== undefined
        ? normaliseTags(args.patch.tags)
        : existing.tags,
    updatedAt: new Date(),
  };
  contactsTable.set(next.id, next);
  return next;
}

export async function deleteContact(
  organizationId: string,
  id: ContactId,
): Promise<boolean> {
  const existing = contactsTable.get(id);
  if (!existing || existing.organizationId !== organizationId) return false;
  contactsTable.delete(id);
  activitiesTable.delete(id);
  return true;
}

/**
 * Adds `addTags` to and removes `removeTags` from every contact in `ids`
 * that belongs to `organizationId`. Tags not belonging to the org are
 * silently skipped. Returns the list of mutated contacts.
 */
export async function bulkTag(args: {
  organizationId: string;
  ids: ReadonlyArray<ContactId>;
  addTags?: ReadonlyArray<string>;
  removeTags?: ReadonlyArray<string>;
}): Promise<Contact[]> {
  const add = new Set(normaliseTags(args.addTags));
  const remove = new Set(normaliseTags(args.removeTags));
  const out: Contact[] = [];
  for (const id of args.ids) {
    const existing = contactsTable.get(id);
    if (!existing || existing.organizationId !== args.organizationId) continue;
    const merged = new Set(existing.tags);
    for (const t of add) merged.add(t);
    for (const t of remove) merged.delete(t);
    const next: Contact = {
      ...existing,
      tags: [...merged],
      updatedAt: new Date(),
    };
    contactsTable.set(next.id, next);
    out.push(next);
  }
  return out;
}

/**
 * Bulk upserts by email (lowercased). Any row in `inputs` with a matching
 * existing email is patched in place; otherwise a new row is created.
 * Rows without an email are always inserted as new.
 */
export async function bulkUpsertContacts(args: {
  organizationId: string;
  inputs: ReadonlyArray<ContactInput>;
}): Promise<{ created: Contact[]; updated: Contact[] }> {
  const byEmail = new Map<string, Contact>();
  for (const c of contactsTable.values()) {
    if (c.organizationId !== args.organizationId) continue;
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
  }

  const created: Contact[] = [];
  const updated: Contact[] = [];
  for (const input of args.inputs) {
    const key = input.email?.trim().toLowerCase();
    const existing = key ? byEmail.get(key) : undefined;
    if (existing) {
      const next = await updateContact({
        organizationId: args.organizationId,
        id: existing.id,
        patch: input,
      });
      if (next) updated.push(next);
    } else {
      const next = await createContact({
        organizationId: args.organizationId,
        input,
      });
      created.push(next);
      if (next.email) byEmail.set(next.email.toLowerCase(), next);
    }
  }
  return { created, updated };
}

// ---------- activity timeline ------------------------------------------

export async function listActivity(
  organizationId: string,
  contactId: ContactId,
): Promise<ContactActivity[]> {
  const owner = contactsTable.get(contactId);
  if (!owner || owner.organizationId !== organizationId) return [];
  const rows = activitiesTable.get(contactId) ?? [];
  return [...rows].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
  );
}

export async function appendActivity(
  organizationId: string,
  activity: Omit<ContactActivity, "id">,
): Promise<ContactActivity | null> {
  const owner = contactsTable.get(activity.contactId);
  if (!owner || owner.organizationId !== organizationId) return null;
  const row: ContactActivity = { id: uid("ca"), ...activity };
  const existing = activitiesTable.get(activity.contactId) ?? [];
  existing.push(row);
  activitiesTable.set(activity.contactId, existing);
  return row;
}

// ---------- test helpers ------------------------------------------------

/** @internal Clears the in-memory store; intended for tests only. */
export function __resetStoreForTests(): void {
  contactsTable.clear();
  activitiesTable.clear();
}
