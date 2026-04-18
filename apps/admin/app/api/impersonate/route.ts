/**
 * Impersonation handoff (stub).
 *
 * Sets the `sf-impersonating` cookie with the target user id and
 * writes an audit row. The actual session mint — minting a Supabase
 * token for the impersonated user or otherwise swapping the session
 * downstream — is intentionally NOT implemented here. See the
 * TODO in `apps/admin/app/users/[id]/page.tsx`. Until that lands, the
 * cookie is purely a marker of intent that the consuming app can
 * inspect.
 *
 * Domain: in prod set `ADMIN_COOKIE_DOMAIN=.yourdomain.tld` so the
 * cookie is visible to both admin and web. For localhost we leave
 * `domain` unset (host-only).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, logAudit, requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const IMPERSONATE_COOKIE = "sf-impersonating";

const schema = z.object({ userId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    await logAudit(
      {
        action: "admin.impersonate.start",
        targetType: "user",
        targetId: body.userId,
        metadata: { via: "admin-console" },
      },
      session,
    );

    const res = NextResponse.json({ ok: true, userId: body.userId });
    res.cookies.set(IMPERSONATE_COOKIE, body.userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.ADMIN_COOKIE_DOMAIN || undefined,
      path: "/",
      // 1 hour — short by design; operators can re-issue if they need longer.
      maxAge: 60 * 60,
    });
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_body", issues: err.issues }, {
        status: 400,
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
