/**
 * GET /api/sso/callback
 *
 * WorkOS redirects back here after the IdP. We exchange the `code` for
 * the authenticated profile and either:
 *
 *   - if a local `users` row with that email already exists → upsert
 *     the membership into the right org and redirect to `/`;
 *   - if not → create one (disabled-password row) and then redirect.
 *
 * Full Supabase session cookie minting is deferred to the JIT handler
 * in `@sparkflow/auth` once WorkOS Supabase federation lands; for now
 * we redirect to `/login?sso=done&email=…` so the existing login flow
 * can pick up from there. See TODO at the bottom.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, memberships, organizations, users } from "@sparkflow/db";
import { handleCallback } from "@sparkflow/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  const result = await handleCallback(code);
  if (!result.configured) {
    return NextResponse.json(
      { error: "sso_not_configured", detail: result.reason },
      { status: 503 },
    );
  }

  const db = getDb();

  // Resolve the SparkFlow org. Prefer the state slug that we set in
  // /authorize; fall back to the WorkOS-reported organization_id (which
  // operators sometimes map 1:1 to our org slug).
  let organizationId: string | null = null;
  if (state) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, state))
      .limit(1);
    if (org) organizationId = org.id;
  }
  if (!organizationId && result.organizationId) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, result.organizationId))
      .limit(1);
    if (org) organizationId = org.id;
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "unknown_org", detail: "No SparkFlow org matches the SSO state" },
      { status: 404 },
    );
  }

  // Upsert the user by email.
  const email = result.profile.email.toLowerCase();
  const displayName =
    [result.profile.firstName, result.profile.lastName].filter(Boolean).join(" ") || null;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const [inserted] = await db
      .insert(users)
      .values({ email, displayName })
      .returning({ id: users.id });
    if (!inserted) {
      return NextResponse.json({ error: "user_insert_failed" }, { status: 500 });
    }
    userId = inserted.id;
  }

  // Ensure membership.
  const [existingMembership] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)),
    )
    .limit(1);
  if (!existingMembership) {
    await db.insert(memberships).values({
      userId,
      organizationId,
      role: "member",
    });
  }

  // TODO: once WorkOS ↔ Supabase federation is wired, mint a full
  // Supabase session here and set the auth cookies via
  // `createSupabaseServerClient()`. For now we hand off to the standard
  // login page with a signal that SSO already validated the user.
  const redirect = new URL("/login", req.nextUrl.origin);
  redirect.searchParams.set("sso", "done");
  redirect.searchParams.set("email", email);
  redirect.searchParams.set("idp", result.idpId);
  return NextResponse.redirect(redirect);
}
