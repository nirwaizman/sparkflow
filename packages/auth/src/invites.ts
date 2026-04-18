/**
 * Organization invitations.
 *
 * TODO(WP-A3 follow-up): add a real `invites` table to `@sparkflow/db`
 * with columns: id, organization_id, email, role, token, invited_by,
 * expires_at, accepted_at, created_at. Until that migration ships we
 * back the store with an in-memory Map keyed by token. This stub
 * preserves the public API so the database-backed implementation is a
 * drop-in replacement.
 */
import { and, eq } from "drizzle-orm";
import { getDb, memberships, organizations, users } from "@sparkflow/db";
import { ACTIVE_ORG_COOKIE, AuthError, type AuthSession, type Role } from "./types";

interface InviteRecord {
  token: string;
  organizationId: string;
  email: string;
  role: Role;
  invitedBy: string;
  expiresAt: number;
  acceptedAt: number | null;
}

// In-memory store — resets on server restart. TODO: swap for db table.
const INVITE_STORE: Map<string, InviteRecord> = new Map();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function randomToken(): string {
  // 24 bytes of entropy, url-safe base64. Works in Node and edge.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  );
}

export interface CreateInviteInput {
  organizationId: string;
  email: string;
  role: Role;
  invitedBy: string;
}

export async function createInvite(
  input: CreateInviteInput,
): Promise<{ token: string; url: string }> {
  const token = randomToken();
  const record: InviteRecord = {
    token,
    organizationId: input.organizationId,
    email: input.email.toLowerCase().trim(),
    role: input.role,
    invitedBy: input.invitedBy,
    expiresAt: Date.now() + INVITE_TTL_MS,
    acceptedAt: null,
  };
  INVITE_STORE.set(token, record);
  const url = `${appBaseUrl()}/invite/${encodeURIComponent(token)}`;
  return { token, url };
}

/**
 * Accept an invite as `userId`, create the membership, set the
 * `sf-active-org` cookie, and return the resulting session shape.
 *
 * Idempotent: accepting the same token twice is a no-op on the second
 * call (returns the same session).
 */
export async function acceptInvite(token: string, userId: string): Promise<AuthSession> {
  const record = INVITE_STORE.get(token);
  if (!record) {
    throw new AuthError("Invite not found or expired", {
      status: 404,
      code: "invite_not_found",
    });
  }
  if (record.expiresAt < Date.now()) {
    throw new AuthError("Invite expired", { status: 410, code: "invite_expired" });
  }

  const db = getDb();

  // Look up user + org to assemble the session.
  const [userRow] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    throw new AuthError("User not found", { status: 404, code: "user_not_found" });
  }

  const [orgRow] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, record.organizationId))
    .limit(1);
  if (!orgRow) {
    throw new AuthError("Organization not found", {
      status: 404,
      code: "org_not_found",
    });
  }

  // Upsert membership (idempotent on duplicate).
  const existing = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, record.organizationId),
      ),
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(memberships).values({
      userId,
      organizationId: record.organizationId,
      role: record.role,
    });
  }

  record.acceptedAt = Date.now();

  // Set active-org cookie so the next request lands in the new org.
  try {
    const { cookies } = await import("next/headers");
    const store = await (cookies() as unknown as Promise<Awaited<ReturnType<typeof cookies>>>);
    (store as unknown as {
      set: (opts: {
        name: string;
        value: string;
        httpOnly?: boolean;
        sameSite?: "lax" | "strict" | "none";
        path?: string;
        maxAge?: number;
      }) => void;
    }).set({
      name: ACTIVE_ORG_COOKIE,
      value: record.organizationId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    /* non-writable context — caller can re-set */
  }

  return {
    user: {
      id: userRow.id,
      email: userRow.email,
      name: userRow.displayName ?? undefined,
    },
    organizationId: record.organizationId,
    role: existing[0]?.role ? (existing[0].role as Role) : record.role,
  };
}

/** Testing helper — not exported from the package barrel. */
export function _resetInviteStore(): void {
  INVITE_STORE.clear();
}
