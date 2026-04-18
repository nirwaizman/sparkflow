/**
 * Session resolution.
 *
 * `getSession()` is the single source of truth for "who is calling?" in
 * server code. It:
 *   1. Asks Supabase for the authenticated user via the SSR client.
 *   2. Loads the user's memberships from Postgres.
 *   3. Picks an active org:
 *        a. cookie `sf-active-org` if the user is still a member there;
 *        b. else `users.default_organization_id`;
 *        c. else the first membership by createdAt.
 *   4. Returns `{ user, organizationId, role }`.
 *
 * `requireSession()` throws `AuthError` when there is no session.
 * `requireRole(session, minRole)` enforces a minimum role rank.
 */
import { and, eq } from "drizzle-orm";
import { getDb, memberships, users } from "@sparkflow/db";
import { ACTIVE_ORG_COOKIE, AuthError, ROLE_RANK, type AuthSession, type Role } from "./types";
import { createSupabaseServerClient } from "./supabase";

async function readActiveOrgCookie(): Promise<string | undefined> {
  const { cookies } = await import("next/headers");
  const store = await (cookies() as unknown as Promise<Awaited<ReturnType<typeof cookies>>>);
  return store.get(ACTIVE_ORG_COOKIE)?.value;
}

export async function getSession(): Promise<AuthSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const authUserId = data.user.id;
  const email = data.user.email ?? "";
  const metaName =
    (data.user.user_metadata as { name?: string; full_name?: string } | null)?.name ??
    (data.user.user_metadata as { full_name?: string } | null)?.full_name;

  const db = getDb();

  // Pull memberships + user's default org in one round-trip each. We
  // intentionally keep the queries simple and avoid a join so the
  // function works even before any memberships exist for the user.
  const [userRow] = await db
    .select({
      id: users.id,
      defaultOrganizationId: users.defaultOrganizationId,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, authUserId))
    .limit(1);

  if (!userRow) {
    // User exists in Supabase auth but has no app-level row yet. The
    // OAuth callback is responsible for creating it; until then we can
    // treat the session as "pending" → no session.
    return null;
  }

  const rows = await db
    .select({
      organizationId: memberships.organizationId,
      role: memberships.role,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .where(eq(memberships.userId, authUserId));

  if (rows.length === 0) return null;

  const cookieOrg = await readActiveOrgCookie();
  type Row = (typeof rows)[number];
  let picked: Row | undefined = rows.find((r: Row) => r.organizationId === cookieOrg);
  if (!picked && userRow.defaultOrganizationId) {
    picked = rows.find(
      (r: Row) => r.organizationId === userRow.defaultOrganizationId,
    );
  }
  if (!picked) {
    picked = [...rows].sort(
      (a: Row, b: Row) => a.createdAt.getTime() - b.createdAt.getTime(),
    )[0];
  }
  if (!picked) return null;

  return {
    user: {
      id: authUserId,
      email,
      name: metaName ?? userRow.displayName ?? undefined,
    },
    organizationId: picked.organizationId,
    role: picked.role as Role,
  };
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Not authenticated", { status: 401, code: "unauthorized" });
  }
  return session;
}

export function requireRole(session: AuthSession, minRole: Role): void {
  if (ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    throw new AuthError(`Requires role >= ${minRole}`, {
      status: 403,
      code: "forbidden",
    });
  }
}

/**
 * Helper: re-read the user's membership for an arbitrary org. Used by
 * `/api/orgs/switch` to verify the target org before setting the
 * active-org cookie.
 */
export async function getMembership(
  userId: string,
  organizationId: string,
): Promise<{ role: Role } | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)),
    )
    .limit(1);
  return row ? { role: row.role as Role } : null;
}
