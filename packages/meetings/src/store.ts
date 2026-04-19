/**
 * In-memory meeting store.
 *
 * ---------------------------------------------------------------------------
 * TODO(meetings): migrate to Postgres.
 *
 * When the meetings table lands in `@sparkflow/db`, swap this file out for
 * a thin drizzle-backed implementation. The shape of `MeetingRecord` is the
 * row shape we want; keep it stable so the migration is mechanical:
 *
 *   meetings(
 *     id uuid primary key,
 *     organization_id uuid references organizations(id),
 *     user_id uuid references users(id),
 *     title text,
 *     storage_path text,
 *     mime text,
 *     size_bytes bigint,
 *     status text,       -- uploaded | processing | ready | failed
 *     error text,
 *     notes jsonb,       -- MeetingNotes (summary, actionItems, decisions, ...)
 *     created_at timestamptz default now(),
 *     updated_at timestamptz default now()
 *   )
 *
 * Callers already use this module through its async API (`listMeetings`,
 * `getMeeting`, `createMeeting`, `updateMeeting`) so the swap is local.
 * ---------------------------------------------------------------------------
 */

import type { MeetingNotes, MeetingRecord } from "./types";

// Module-level map. In serverless Next.js this is per-instance and will not
// survive cold starts — which is exactly why the Postgres migration above is
// required before this ships.
const store = new Map<string, MeetingRecord>();

export async function listMeetings(organizationId: string): Promise<MeetingRecord[]> {
  return [...store.values()]
    .filter((m) => m.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMeeting(
  id: string,
  organizationId: string,
): Promise<MeetingRecord | undefined> {
  const row = store.get(id);
  if (!row || row.organizationId !== organizationId) return undefined;
  return row;
}

export type CreateMeetingInput = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  storagePath: string;
  mime: string;
  sizeBytes: number;
};

export async function createMeeting(input: CreateMeetingInput): Promise<MeetingRecord> {
  const now = new Date().toISOString();
  const row: MeetingRecord = {
    id: input.id,
    organizationId: input.organizationId,
    userId: input.userId,
    title: input.title,
    storagePath: input.storagePath,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
    status: "uploaded",
    createdAt: now,
    updatedAt: now,
  };
  store.set(row.id, row);
  return row;
}

export type UpdateMeetingPatch = Partial<
  Pick<MeetingRecord, "status" | "error" | "title"> & { notes: MeetingNotes }
>;

export async function updateMeeting(
  id: string,
  patch: UpdateMeetingPatch,
): Promise<MeetingRecord | undefined> {
  const existing = store.get(id);
  if (!existing) return undefined;
  const next: MeetingRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.set(id, next);
  return next;
}

export async function deleteMeeting(id: string, organizationId: string): Promise<boolean> {
  const existing = store.get(id);
  if (!existing || existing.organizationId !== organizationId) return false;
  return store.delete(id);
}

/** Test-only: wipe everything. */
export function __resetMeetingStoreForTests(): void {
  store.clear();
}
