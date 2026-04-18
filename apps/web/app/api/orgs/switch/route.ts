/**
 * POST /api/orgs/switch
 *
 * Body: `{ organizationId: string }`
 *
 * Verifies the caller is a member of the target org, sets the
 * `sf-active-org` cookie, and writes an audit entry. Returns the
 * refreshed session.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ACTIVE_ORG_COOKIE,
  getMembership,
  getSession,
  logAudit,
} from "@sparkflow/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid_body" },
      { status: 400 },
    );
  }

  const membership = await getMembership(session.user.id, parsed.organizationId);
  if (!membership) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const nextSession = {
    ...session,
    organizationId: parsed.organizationId,
    role: membership.role,
  };

  await logAudit(
    {
      action: "org.switch",
      targetType: "organization",
      targetId: parsed.organizationId,
      metadata: { from: session.organizationId },
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
    // Audit the switch against the *new* org so it's visible to its
    // admins, but record the source org in metadata.
    nextSession,
  );

  const response = NextResponse.json({ session: nextSession });
  response.cookies.set({
    name: ACTIVE_ORG_COOKIE,
    value: parsed.organizationId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
