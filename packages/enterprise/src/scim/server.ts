/**
 * SCIM 2.0 server for Users and Groups.
 *
 * Only the subset IdPs actually exercise is implemented: GET list / GET
 * by id / POST create / PATCH update / DELETE for both `/Users` and
 * `/Groups`.
 *
 * Storage:
 *   - Users are projected onto `@sparkflow/db.users` + a membership in
 *     the org the SCIM token belongs to.
 *   - Groups are kept **in-memory only** for now — the schema change
 *     needed to persist them (scim_groups, scim_group_members) is a
 *     separate migration. This means groups are process-local and will
 *     reset on redeploy. That is acceptable for the MVP since the IdP
 *     re-syncs groups on every push. (TODO below.)
 *
 * Auth:
 *   The caller must present `Authorization: Bearer <org.id>:<raw-token>`.
 *   We hash `<raw-token>` with SHA-256 and compare against the hash
 *   stored for that org. Hashes live in an in-memory map for now
 *   (`registerScimToken` / `clearScimToken`) until the `scim_tokens`
 *   table lands. (TODO below.)
 *
 * TODOs (not implemented on purpose — out of scope for this PR):
 *   - add `scim_tokens` table: (org_id, token_hash, created_at, last_used_at, revoked_at)
 *   - add `scim_groups` + `scim_group_members` tables
 *   - rotate-token endpoint
 *   - SCIM schema endpoints (`/Schemas`, `/ResourceTypes`, `/ServiceProviderConfig`)
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  memberships,
  users,
  type Database,
  type MembershipRole,
} from "@sparkflow/db";

// ---------------------------------------------------------------------------
// zod schemas
// ---------------------------------------------------------------------------

const ScimNameSchema = z
  .object({
    formatted: z.string().optional(),
    familyName: z.string().optional(),
    givenName: z.string().optional(),
  })
  .partial()
  .optional();

const ScimEmailSchema = z.object({
  value: z.string().email(),
  primary: z.boolean().optional(),
  type: z.string().optional(),
});

export const ScimUserSchema = z.object({
  schemas: z.array(z.string()).optional(),
  id: z.string().optional(),
  externalId: z.string().optional(),
  userName: z.string(),
  name: ScimNameSchema,
  displayName: z.string().optional(),
  active: z.boolean().optional().default(true),
  emails: z.array(ScimEmailSchema).optional(),
});
export type ScimUser = z.infer<typeof ScimUserSchema>;

const ScimMemberSchema = z.object({
  value: z.string(),
  display: z.string().optional(),
  type: z.string().optional(),
});

export const ScimGroupSchema = z.object({
  schemas: z.array(z.string()).optional(),
  id: z.string().optional(),
  externalId: z.string().optional(),
  displayName: z.string(),
  members: z.array(ScimMemberSchema).optional(),
});
export type ScimGroup = z.infer<typeof ScimGroupSchema>;

const ScimPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "Add", "Remove", "Replace"]),
  path: z.string().optional(),
  value: z.unknown().optional(),
});

const ScimPatchSchema = z.object({
  schemas: z.array(z.string()).optional(),
  Operations: z.array(ScimPatchOpSchema),
});

// ---------------------------------------------------------------------------
// request / response types
// ---------------------------------------------------------------------------

export interface ScimRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path relative to `/scim/v2`, e.g. `/Users`, `/Users/abc`, `/Groups/xyz`. */
  path: string;
  body?: unknown;
  bearer?: string | null;
  /** Query string parameters (filter, startIndex, count, etc.). */
  query?: Record<string, string | undefined>;
}

export interface ScimResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Token store (TODO: back with `scim_tokens` table)
// ---------------------------------------------------------------------------

/** orgId → sha256(token) */
const tokenHashes = new Map<string, string>();

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Register a SCIM token for an org (stores only the hash). */
export function registerScimToken(orgId: string, rawToken: string): void {
  tokenHashes.set(orgId, sha256(rawToken));
}

/** Remove the SCIM token for an org. */
export function clearScimToken(orgId: string): void {
  tokenHashes.delete(orgId);
}

/**
 * Parse `Authorization: Bearer <orgId>:<raw-token>` and verify the
 * hashed token matches what we have registered for that org. Returns the
 * `orgId` on success, or null if the token is missing/invalid.
 */
function verifyBearer(bearer: string | null | undefined): string | null {
  if (!bearer) return null;
  const m = /^Bearer\s+(.+)$/i.exec(bearer.trim());
  if (!m) return null;
  const creds = m[1];
  if (!creds) return null;
  const idx = creds.indexOf(":");
  if (idx < 0) return null;
  const orgId = creds.slice(0, idx);
  const rawToken = creds.slice(idx + 1);
  if (!orgId || !rawToken) return null;

  const stored = tokenHashes.get(orgId);
  if (!stored) return null;

  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(sha256(rawToken), "hex");
  if (a.length !== b.length) return null;
  try {
    return timingSafeEqual(a, b) ? orgId : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SCIM error helpers
// ---------------------------------------------------------------------------

function scimError(status: number, detail: string, scimType?: string): ScimResponse {
  return {
    status,
    body: {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
      status: String(status),
      detail,
      ...(scimType ? { scimType } : {}),
    },
    headers: { "content-type": "application/scim+json" },
  };
}

function ok(body: unknown, status = 200): ScimResponse {
  return {
    status,
    body,
    headers: { "content-type": "application/scim+json" },
  };
}

// ---------------------------------------------------------------------------
// SCIM <-> DB projection helpers
// ---------------------------------------------------------------------------

function userRowToScim(row: {
  id: string;
  email: string;
  displayName: string | null;
}): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id,
    userName: row.email,
    displayName: row.displayName ?? row.email,
    active: true,
    emails: [{ value: row.email, primary: true, type: "work" }],
    meta: {
      resourceType: "User",
    },
  };
}

function scimToUserPatch(user: ScimUser): {
  email?: string;
  displayName?: string | null;
} {
  const primaryEmail =
    user.emails?.find((e) => e.primary)?.value ??
    user.emails?.[0]?.value ??
    user.userName;
  const nameJoined = [user.name?.givenName, user.name?.familyName]
    .filter(Boolean)
    .join(" ");
  const displayName =
    user.displayName ??
    user.name?.formatted ??
    (nameJoined.length > 0 ? nameJoined : null);
  return {
    email: primaryEmail,
    displayName: displayName ?? null,
  };
}

// ---------------------------------------------------------------------------
// In-memory group store (TODO: back with `scim_groups` tables)
// ---------------------------------------------------------------------------

interface StoredGroup {
  id: string;
  orgId: string;
  displayName: string;
  externalId?: string;
  memberIds: Set<string>;
}

const groupStore = new Map<string, StoredGroup>();

function groupKey(orgId: string, id: string): string {
  return `${orgId}:${id}`;
}

function storedGroupToScim(g: StoredGroup): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: g.id,
    displayName: g.displayName,
    externalId: g.externalId,
    members: [...g.memberIds].map((value) => ({ value })),
    meta: { resourceType: "Group" },
  };
}

function randomId(): string {
  // Small dependency-free id. Not cryptographic; we don't need it to be.
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}

// ---------------------------------------------------------------------------
// Users collection handlers
// ---------------------------------------------------------------------------

async function listUsers(orgId: string, db: Database): Promise<ScimResponse> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, orgId));

  return ok({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: rows.length,
    startIndex: 1,
    itemsPerPage: rows.length,
    Resources: rows.map(userRowToScim),
  });
}

async function getUser(
  orgId: string,
  userId: string,
  db: Database,
): Promise<ScimResponse> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(memberships.organizationId, orgId), eq(users.id, userId)))
    .limit(1);

  if (!row) return scimError(404, "User not found");
  return ok(userRowToScim(row));
}

async function createUser(
  orgId: string,
  body: unknown,
  db: Database,
): Promise<ScimResponse> {
  const parsed = ScimUserSchema.safeParse(body);
  if (!parsed.success) return scimError(400, parsed.error.message, "invalidValue");

  const patch = scimToUserPatch(parsed.data);
  if (!patch.email) return scimError(400, "email required", "invalidValue");

  const now = new Date();

  // Upsert-by-email: if the user already exists, we just ensure the
  // membership row. SCIM treats this as idempotent.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, patch.email))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    if (patch.displayName !== undefined) {
      await db
        .update(users)
        .set({ displayName: patch.displayName, updatedAt: now })
        .where(eq(users.id, userId));
    }
  } else {
    const [inserted] = await db
      .insert(users)
      .values({
        email: patch.email,
        displayName: patch.displayName ?? null,
      })
      .returning({ id: users.id });
    if (!inserted) return scimError(500, "insert failed");
    userId = inserted.id;
  }

  const defaultRole: MembershipRole = "member";
  await db
    .insert(memberships)
    .values({
      userId,
      organizationId: orgId,
      role: defaultRole,
    })
    .onConflictDoNothing();

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return scimError(500, "post-insert read failed");
  return ok(userRowToScim(row), 201);
}

async function patchUser(
  orgId: string,
  userId: string,
  body: unknown,
  db: Database,
): Promise<ScimResponse> {
  const parsed = ScimPatchSchema.safeParse(body);
  if (!parsed.success) return scimError(400, parsed.error.message, "invalidValue");

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(memberships.organizationId, orgId), eq(users.id, userId)))
    .limit(1);
  if (!row) return scimError(404, "User not found");

  let active = true;
  let newDisplayName: string | null | undefined;
  let newEmail: string | undefined;

  for (const op of parsed.data.Operations) {
    const opName = op.op.toLowerCase();
    // Minimal path handling: `active`, `displayName`, `emails[...].value`
    const path = (op.path ?? "").toLowerCase();
    const val = op.value;

    if (path === "active" || (!path && val && typeof (val as Record<string, unknown>).active === "boolean")) {
      const raw = path ? val : (val as { active: boolean }).active;
      if (typeof raw === "boolean") active = raw;
      else if (typeof raw === "string") active = raw === "true";
    } else if (path === "displayname") {
      if (typeof val === "string") newDisplayName = val;
      else if (opName === "remove") newDisplayName = null;
    } else if (path.startsWith("emails")) {
      if (Array.isArray(val)) {
        const first = val[0] as { value?: string } | undefined;
        if (first?.value) newEmail = first.value;
      } else if (val && typeof val === "object" && "value" in (val as object)) {
        const v = (val as { value?: string }).value;
        if (v) newEmail = v;
      }
    } else if (!path && val && typeof val === "object") {
      // Replace-whole-object form.
      const v = val as {
        displayName?: string;
        active?: boolean;
        emails?: Array<{ value?: string; primary?: boolean }>;
      };
      if (typeof v.displayName === "string") newDisplayName = v.displayName;
      if (typeof v.active === "boolean") active = v.active;
      if (v.emails && v.emails.length > 0) {
        const primary = v.emails.find((e) => e.primary) ?? v.emails[0];
        if (primary?.value) newEmail = primary.value;
      }
    }
  }

  const now = new Date();
  if (newDisplayName !== undefined || newEmail !== undefined) {
    const updates: Record<string, unknown> = { updatedAt: now };
    if (newDisplayName !== undefined) updates.displayName = newDisplayName;
    if (newEmail !== undefined) updates.email = newEmail;
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  if (!active) {
    // Deprovision: remove the membership for this org. The user row
    // itself survives (they may belong to other orgs).
    await db
      .delete(memberships)
      .where(
        and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)),
      );
    return ok({ ...userRowToScim(row), active: false });
  }

  const [fresh] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return ok(userRowToScim(fresh ?? row));
}

async function deleteUser(
  orgId: string,
  userId: string,
  db: Database,
): Promise<ScimResponse> {
  const result = await db
    .delete(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.organizationId, orgId)),
    );
  // Drizzle's return type varies by driver; we treat "no rows" as 404.
  const rowCount = (result as unknown as { count?: number }).count;
  if (typeof rowCount === "number" && rowCount === 0) {
    return scimError(404, "User not found");
  }
  return { status: 204, body: null };
}

// ---------------------------------------------------------------------------
// Groups collection handlers
// ---------------------------------------------------------------------------

function listGroups(orgId: string): ScimResponse {
  const all = [...groupStore.values()].filter((g) => g.orgId === orgId);
  return ok({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: all.length,
    startIndex: 1,
    itemsPerPage: all.length,
    Resources: all.map(storedGroupToScim),
  });
}

function getGroup(orgId: string, groupId: string): ScimResponse {
  const g = groupStore.get(groupKey(orgId, groupId));
  if (!g) return scimError(404, "Group not found");
  return ok(storedGroupToScim(g));
}

function createGroup(orgId: string, body: unknown): ScimResponse {
  const parsed = ScimGroupSchema.safeParse(body);
  if (!parsed.success) return scimError(400, parsed.error.message, "invalidValue");
  const id = parsed.data.id ?? randomId();
  const g: StoredGroup = {
    id,
    orgId,
    displayName: parsed.data.displayName,
    externalId: parsed.data.externalId,
    memberIds: new Set((parsed.data.members ?? []).map((m) => m.value)),
  };
  groupStore.set(groupKey(orgId, id), g);
  return ok(storedGroupToScim(g), 201);
}

function patchGroup(orgId: string, groupId: string, body: unknown): ScimResponse {
  const g = groupStore.get(groupKey(orgId, groupId));
  if (!g) return scimError(404, "Group not found");
  const parsed = ScimPatchSchema.safeParse(body);
  if (!parsed.success) return scimError(400, parsed.error.message, "invalidValue");

  for (const op of parsed.data.Operations) {
    const opName = op.op.toLowerCase();
    const path = (op.path ?? "").toLowerCase();
    const val = op.value;

    if (path.startsWith("members")) {
      const asArray = Array.isArray(val)
        ? (val as Array<{ value?: string }>)
        : val && typeof val === "object"
          ? [val as { value?: string }]
          : [];
      if (opName === "add") {
        for (const m of asArray) if (m.value) g.memberIds.add(m.value);
      } else if (opName === "remove") {
        if (asArray.length === 0) {
          // remove everyone (fullpath variant: `members`)
          g.memberIds.clear();
        } else {
          for (const m of asArray) if (m.value) g.memberIds.delete(m.value);
        }
      } else if (opName === "replace") {
        g.memberIds = new Set(asArray.map((m) => m.value).filter((v): v is string => !!v));
      }
    } else if (path === "displayname") {
      if (typeof val === "string") g.displayName = val;
    } else if (!path && val && typeof val === "object") {
      const v = val as { displayName?: string; members?: Array<{ value?: string }> };
      if (typeof v.displayName === "string") g.displayName = v.displayName;
      if (Array.isArray(v.members)) {
        g.memberIds = new Set(v.members.map((m) => m.value).filter((x): x is string => !!x));
      }
    }
  }

  groupStore.set(groupKey(orgId, groupId), g);
  return ok(storedGroupToScim(g));
}

function deleteGroup(orgId: string, groupId: string): ScimResponse {
  const existed = groupStore.delete(groupKey(orgId, groupId));
  if (!existed) return scimError(404, "Group not found");
  return { status: 204, body: null };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

interface ParsedPath {
  resource: "Users" | "Groups";
  id: string | null;
}

function parsePath(path: string): ParsedPath | null {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  const [resource, id, ...rest] = trimmed.split("/");
  if (rest.length > 0) return null;
  if (resource !== "Users" && resource !== "Groups") return null;
  return { resource, id: id && id.length > 0 ? id : null };
}

export async function handleScimRequest(req: ScimRequest): Promise<ScimResponse> {
  const orgId = verifyBearer(req.bearer);
  if (!orgId) return scimError(401, "invalid or missing bearer");

  const parsed = parsePath(req.path);
  if (!parsed) return scimError(404, `unknown resource: ${req.path}`);

  const db = getDb();

  if (parsed.resource === "Users") {
    switch (req.method) {
      case "GET":
        return parsed.id ? getUser(orgId, parsed.id, db) : listUsers(orgId, db);
      case "POST":
        if (parsed.id) return scimError(405, "POST on item");
        return createUser(orgId, req.body, db);
      case "PATCH":
      case "PUT":
        if (!parsed.id) return scimError(405, "PATCH on collection");
        return patchUser(orgId, parsed.id, req.body, db);
      case "DELETE":
        if (!parsed.id) return scimError(405, "DELETE on collection");
        return deleteUser(orgId, parsed.id, db);
    }
  } else {
    switch (req.method) {
      case "GET":
        return parsed.id ? getGroup(orgId, parsed.id) : listGroups(orgId);
      case "POST":
        if (parsed.id) return scimError(405, "POST on item");
        return createGroup(orgId, req.body);
      case "PATCH":
      case "PUT":
        if (!parsed.id) return scimError(405, "PATCH on collection");
        return patchGroup(orgId, parsed.id, req.body);
      case "DELETE":
        if (!parsed.id) return scimError(405, "DELETE on collection");
        return deleteGroup(orgId, parsed.id);
    }
  }

  return scimError(405, `method not allowed: ${req.method}`);
}

/**
 * Helper for the admin UI: generate a new random SCIM token, register
 * its hash, and return the raw value to display once.
 */
export function mintScimToken(orgId: string): string {
  const raw =
    randomId() + randomId() + Date.now().toString(36);
  registerScimToken(orgId, raw);
  return raw;
}
