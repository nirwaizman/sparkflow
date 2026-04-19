/**
 * /api/webhooks — CRUD for outgoing webhook subscriptions.
 *
 * Session-scoped (not API-key): the Developers page is the canonical
 * management surface. Storage is in-memory for now (see webhook-store).
 *
 * Event vocabulary (stable v0):
 *   task.created, task.completed, task.failed
 *   workflow.run.started, workflow.run.completed, workflow.run.failed
 *   file.uploaded, file.ingested, file.failed
 *   "*" = wildcard (all events)
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession, logAudit } from "@sparkflow/auth";
import { createWebhook, listWebhooks } from "@/lib/public-api/webhook-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1).max(32),
  secret: z.string().min(8).max(200).optional(),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = listWebhooks(session.organizationId).map((r) => ({
    id: r.id,
    url: r.url,
    events: r.events,
    createdAt: r.createdAt,
    lastDeliveredAt: r.lastDeliveredAt,
    lastStatus: r.lastStatus,
    // Never return the secret on list; it was shown at creation time.
  }));
  return NextResponse.json({ webhooks: rows });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = createWebhook({
    organizationId: session.organizationId,
    url: parsed.data.url,
    events: parsed.data.events,
    secret: parsed.data.secret,
  });

  await logAudit(
    {
      action: "webhook.created",
      targetType: "webhook_subscription",
      targetId: row.id,
      metadata: { url: row.url, events: row.events },
    },
    session,
  );

  // Return the secret ONCE on creation so the UI can show it.
  return NextResponse.json({ webhook: row }, { status: 201 });
}
