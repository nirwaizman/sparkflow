/**
 * /auth/sync — called by the client-side /auth/confirm page after it
 * establishes a Supabase session from the magic-link URL fragment.
 *
 * Responsibilities:
 *  - Verify the session server-side.
 *  - Upsert the app-level `users` row.
 *  - Create a personal organization + owner membership on first sign-in.
 *  - Set the active-org cookie.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, memberships, organizations, users } from "@sparkflow/db";
import { createSupabaseServerClient, ACTIVE_ORG_COOKIE } from "@sparkflow/auth";
import { sendEmail, WelcomeEmail } from "@sparkflow/growth";

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

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const email = user.email ?? "";
  const displayName =
    (user.user_metadata as { name?: string; full_name?: string } | null)?.name ??
    (user.user_metadata as { full_name?: string } | null)?.full_name ??
    null;

  const db = getDb();

  const existingUser = await db
    .select({
      id: users.id,
      defaultOrganizationId: users.defaultOrganizationId,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  let defaultOrgId: string | null = existingUser[0]?.defaultOrganizationId ?? null;
  const isFirstLogin = existingUser.length === 0;

  if (isFirstLogin) {
    await db.insert(users).values({
      id: user.id,
      email,
      displayName,
    });
  }

  if (!defaultOrgId) {
    const existingMembership = await db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);

    if (existingMembership.length === 0) {
      const localPart = email.split("@")[0] ?? "user";
      const baseSlug = slugify(localPart);
      const slug = `${baseSlug}-${user.id.slice(0, 6)}`;
      const orgName = displayName ? `${displayName}'s workspace` : `${baseSlug}'s workspace`;

      const [createdOrg] = await db
        .insert(organizations)
        .values({ name: orgName, slug })
        .returning({ id: organizations.id });

      if (createdOrg) {
        defaultOrgId = createdOrg.id;
        await db.insert(memberships).values({
          userId: user.id,
          organizationId: createdOrg.id,
          role: "owner",
        });
        await db
          .update(users)
          .set({ defaultOrganizationId: createdOrg.id })
          .where(eq(users.id, user.id));
      }
    } else {
      defaultOrgId = existingMembership[0]?.organizationId ?? null;
    }
  }

  // Fire a welcome email once — strictly on first login so we don't
  // spam returning users. sendEmail is a no-op when RESEND_API_KEY is
  // missing, so this is safe in local/dev environments.
  if (isFirstLogin && email) {
    const origin = new URL(
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
    ).origin;
    void sendEmail({
      to: email,
      subject: "Welcome to SparkFlow",
      react: WelcomeEmail({
        name: displayName,
        workspaceUrl: `${origin}/welcome`,
        docsUrl: `${origin}/docs`,
      }),
    }).catch(() => {
      // Swallow — email should never block sign-in.
    });
  }

  const response = NextResponse.json({ ok: true, organizationId: defaultOrgId });
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
