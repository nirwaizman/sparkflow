/**
 * POST /api/referrals/attribute
 *
 * Called by the signup / auth-callback flow when a fresh account lands
 * with a `?ref=<code>` query param. Body: `{ code, newUserId }`.
 *
 * The route validates the session for `newUserId` before recording the
 * attribution — we do not trust the body's `newUserId` field on its
 * own, to prevent third parties from claiming invites for other users.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import { attributeReferral } from "@sparkflow/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().min(4).max(32),
  /**
   * Optional — if provided it must match the authenticated user. The
   * parameter exists so the signup client can be explicit about who it
   * thinks it's attributing to.
   */
  newUserId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.newUserId && parsed.data.newUserId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = attributeReferral(parsed.data.code, session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    attribution: {
      code: result.attribution.code,
      ownerUserId: result.attribution.ownerUserId,
      attributedAt: result.attribution.attributedAt.toISOString(),
    },
  });
}
