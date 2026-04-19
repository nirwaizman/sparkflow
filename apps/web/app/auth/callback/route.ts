/**
 * Supabase OAuth / magic-link callback handler.
 *
 * Flow:
 *   1. Supabase redirects here with `?code=...` (and optional `next=...`).
 *   2. We exchange the code for a session — cookies are set by the SSR
 *      client via the adapter in `createSupabaseServerClient`.
 *   3. On success we upsert the app-level `users` row and, if needed,
 *      create a personal organization + owner membership. The active
 *      org cookie is set so the first protected request lands in the
 *      right tenant.
 *   4. Redirect to `next` (default `/`).
 *
 * Runs on the Node.js runtime because we touch Postgres.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, memberships, organizations, users } from "@sparkflow/db";
import { createSupabaseServerClient, ACTIVE_ORG_COOKIE } from "@sparkflow/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || "user";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tokenType = url.searchParams.get("type"); // magiclink | recovery | invite | signup
  const next = url.searchParams.get("next") ?? "/";

  // Guard against open-redirect: only accept same-origin relative paths.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code && !tokenHash) {
    const dest = new URL("/login?error=missing_code", url.origin);
    return NextResponse.redirect(dest);
  }

  const supabase = await createSupabaseServerClient();

  let data: { user: { id: string; email?: string | null; user_metadata?: unknown } | null } | null = null;
  let error: { message: string } | null = null;

  if (code) {
    // OAuth / PKCE flow (Google etc.)
    const result = await supabase.auth.exchangeCodeForSession(code);
    data = result.data;
    error = result.error;
  } else if (tokenHash) {
    // Magic link / email OTP flow
    const result = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (tokenType as "magiclink" | "recovery" | "invite" | "signup" | "email") ?? "magiclink",
    });
    data = result.data;
    error = result.error;
  }

  if (error || !data?.user) {
    const dest = new URL(
      `/login?error=${encodeURIComponent(error?.message ?? "exchange_failed")}`,
      url.origin,
    );
    return NextResponse.redirect(dest);
  }

  const authUser = data.user;
  const email = authUser.email ?? "";
  const displayName =
    (authUser.user_metadata as { name?: string; full_name?: string } | null)?.name ??
    (authUser.user_metadata as { full_name?: string } | null)?.full_name ??
    null;

  const db = getDb();

  // Upsert app-level user row.
  const existingUser = await db
    .select({
      id: users.id,
      defaultOrganizationId: users.defaultOrganizationId,
    })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  let defaultOrgId: string | null = existingUser[0]?.defaultOrganizationId ?? null;

  if (existingUser.length === 0) {
    await db.insert(users).values({
      id: authUser.id,
      email,
      displayName,
    });
  }

  // Create a personal org + owner membership if the user has none.
  if (!defaultOrgId) {
    const existingMembership = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, authUser.id))
      .limit(1);

    if (existingMembership.length === 0) {
      const baseSlug = slugify(email.split("@")[0] ?? "user");
      // Append a short suffix to reduce slug collisions without a
      // retry loop. A proper migration-level unique index handles
      // the rare remaining case.
      const slug = `${baseSlug}-${authUser.id.slice(0, 6)}`;
      const orgName = displayName ? `${displayName}'s workspace` : `${baseSlug}'s workspace`;

      const [createdOrg] = await db
        .insert(organizations)
        .values({ name: orgName, slug })
        .returning({ id: organizations.id });

      if (createdOrg) {
        defaultOrgId = createdOrg.id;
        await db.insert(memberships).values({
          userId: authUser.id,
          organizationId: createdOrg.id,
          role: "owner",
        });
        await db
          .update(users)
          .set({ defaultOrganizationId: createdOrg.id })
          .where(eq(users.id, authUser.id));
      }
    } else {
      defaultOrgId = existingMembership[0]?.organizationId ?? null;
    }
  }

  const response = NextResponse.redirect(new URL(safeNext, url.origin));
  if (defaultOrgId) {
    response.cookies.set({
      name: ACTIVE_ORG_COOKIE,
      value: defaultOrgId,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}
