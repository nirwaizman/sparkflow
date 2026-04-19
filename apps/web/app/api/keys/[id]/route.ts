/**
 * DELETE /api/keys/:id — revoke an API key.
 *
 * We don't hard-delete: setting `revoked_at` preserves the audit trail
 * and ensures `verifyApiKey()` rejects future uses without touching
 * hash-compare logic.
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession, logAudit } from "@sparkflow/auth";
import { getDb, apiKeys } from "@sparkflow/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = getDb();
  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, session.organizationId)))
    .returning({ id: apiKeys.id, revokedAt: apiKeys.revokedAt });

  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await logAudit(
    {
      action: "api_key.revoked",
      targetType: "api_key",
      targetId: updated.id,
    },
    session,
  );

  return NextResponse.json({ key: updated });
}
