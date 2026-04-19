/**
 * /auth/devlogin — developer-only one-shot login endpoint.
 *
 * Flow:
 *   1. Generates a magic-link hashed_token via Supabase admin API.
 *   2. Verifies it server-side to obtain access + refresh tokens.
 *   3. Calls supabase.auth.setSession so the SSR client stamps cookies.
 *   4. Upserts the app user + personal organization.
 *   5. Redirects to the target page.
 *
 * Guarded: only runs when NODE_ENV !== "production" AND DEV_LOGIN_EMAIL is set.
 * Usage: GET /auth/devlogin — signs in as DEV_LOGIN_EMAIL and lands on `/chat/new`.
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
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled_in_production" }, { status: 403 });
  }

  const email = process.env.DEV_LOGIN_EMAIL;
  if (!email) {
    return NextResponse.json(
      { error: "DEV_LOGIN_EMAIL not set in env" },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return NextResponse.json({ error: "missing_supabase_env" }, { status: 500 });
  }

  // 1. Generate a magic-link token via admin API.
  const linkResp = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email,
      options: { redirect_to: `${req.nextUrl.origin}/auth/confirm` },
    }),
  });

  if (!linkResp.ok) {
    return NextResponse.json(
      { error: "generate_link_failed", status: linkResp.status, body: await linkResp.text() },
      { status: 500 },
    );
  }

  const linkData = (await linkResp.json()) as { hashed_token?: string };
  const hashedToken = linkData.hashed_token;
  if (!hashedToken) {
    return NextResponse.json({ error: "no_hashed_token" }, { status: 500 });
  }

  // 2. Verify server-side → receive access + refresh tokens.
  const verifyResp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hashedToken }),
  });

  if (!verifyResp.ok) {
    return NextResponse.json(
      { error: "verify_failed", status: verifyResp.status, body: await verifyResp.text() },
      { status: 500 },
    );
  }

  const session = (await verifyResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    user?: { id: string; email?: string; user_metadata?: unknown };
  };

  if (!session.access_token || !session.refresh_token || !session.user) {
    return NextResponse.json({ error: "no_session_returned" }, { status: 500 });
  }

  // 3. Stamp cookies via the SSR client.
  const supabase = await createSupabaseServerClient();
  const { error: setErr } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setErr) {
    return NextResponse.json({ error: "set_session_failed", detail: setErr.message }, { status: 500 });
  }

  // 4. Upsert user + personal org.
  const authUser = session.user;
  const displayName =
    (authUser.user_metadata as { name?: string; full_name?: string } | null)?.name ??
    (authUser.user_metadata as { full_name?: string } | null)?.full_name ??
    null;
  const db = getDb();

  const existing = await db
    .select({ id: users.id, defaultOrganizationId: users.defaultOrganizationId })
    .from(users)
    .where(eq(users.id, authUser.id))
    .limit(1);

  let defaultOrgId: string | null = existing[0]?.defaultOrganizationId ?? null;

  if (existing.length === 0) {
    await db.insert(users).values({
      id: authUser.id,
      email: authUser.email ?? "",
      displayName,
    });
  }

  if (!defaultOrgId) {
    const already = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, authUser.id))
      .limit(1);

    if (already.length === 0) {
      const localPart = (authUser.email ?? "").split("@")[0] ?? "user";
      const slug = `${slugify(localPart)}-${authUser.id.slice(0, 6)}`;
      const orgName = displayName ? `${displayName}'s workspace` : `${localPart}'s workspace`;
      const [created] = await db
        .insert(organizations)
        .values({ name: orgName, slug })
        .returning({ id: organizations.id });
      if (created) {
        defaultOrgId = created.id;
        await db.insert(memberships).values({
          userId: authUser.id,
          organizationId: created.id,
          role: "owner",
        });
        await db
          .update(users)
          .set({ defaultOrganizationId: created.id })
          .where(eq(users.id, authUser.id));
      }
    } else {
      defaultOrgId = already[0]?.organizationId ?? null;
    }
  }

  // 5. Redirect with org cookie set.
  const target = req.nextUrl.searchParams.get("next") ?? "/chat/new";
  const safeTarget = target.startsWith("/") && !target.startsWith("//") ? target : "/chat/new";
  const response = NextResponse.redirect(new URL(safeTarget, req.nextUrl.origin));
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
