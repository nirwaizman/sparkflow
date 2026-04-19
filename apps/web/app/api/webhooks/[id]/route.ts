/**
 * DELETE /api/webhooks/:id — remove a subscription.
 */
import { NextResponse } from "next/server";
import { requireSession, logAudit } from "@sparkflow/auth";
import { deleteWebhook } from "@/lib/public-api/webhook-store";

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
  const ok = deleteWebhook(session.organizationId, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await logAudit(
    {
      action: "webhook.deleted",
      targetType: "webhook_subscription",
      targetId: id,
    },
    session,
  );
  return NextResponse.json({ ok: true });
}
