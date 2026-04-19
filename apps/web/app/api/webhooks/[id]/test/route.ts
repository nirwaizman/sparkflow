/**
 * POST /api/webhooks/:id/test — send a synthetic `test.ping` event to
 * the subscription so customers can verify their receiver end-to-end.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { getWebhook } from "@/lib/public-api/webhook-store";
import { deliverTestEvent } from "@/lib/public-api/emit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const sub = getWebhook(session.organizationId, id);
  if (!sub) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await deliverTestEvent(sub);
  return NextResponse.json({ ok: result.status >= 200 && result.status < 300, status: result.status });
}
