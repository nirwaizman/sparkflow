/**
 * Refund request (stub).
 *
 * Writes a `refund.requested` row to `audit_logs` with the full refund
 * context in metadata. No Stripe call is made — billing is paused at
 * time of writing. Once billing resumes, add the Stripe fanout + patch
 * the audit row's metadata with `stripeRefundId`.
 *
 * We scope the audit row to the TARGET org (not the admin's active
 * org), so per-org operator history is queryable directly off the
 * `audit_logs.organization_id` index.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, getDb, subscriptions } from "@sparkflow/db";
import { AuthError, requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const schema = z.object({
  organizationId: z.string().uuid(),
  amountUsd: z.number().positive().max(1_000_000),
  reason: z.string().min(3).max(500),
  stripeCustomerId: z.string().min(1),
  stripeSubscriptionId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const db = getDb();

    // Sanity-check: the referenced subscription must still exist for
    // this org. This prevents an operator from filing a refund against
    // a cancelled+deleted subscription by accident.
    const [sub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, body.organizationId))
      .limit(1);
    if (!sub) {
      return NextResponse.json(
        { error: "no_subscription_for_org" },
        { status: 404 },
      );
    }

    const [row] = await db
      .insert(auditLogs)
      .values({
        organizationId: body.organizationId,
        actorUserId: session.user.id,
        action: "refund.requested",
        targetType: "subscription",
        targetId: sub.id,
        metadata: {
          status: "pending",
          amountUsd: body.amountUsd,
          reason: body.reason,
          stripeCustomerId: body.stripeCustomerId,
          stripeSubscriptionId: body.stripeSubscriptionId,
          // TODO(billing-resume): populate once a real Stripe refund is
          // issued:
          //   stripeRefundId: ...,
          //   processedAt: ...,
          note: "stub — no Stripe call made; billing paused",
        },
        userAgent: req.headers.get("user-agent"),
      })
      .returning({ id: auditLogs.id });

    if (!row) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, auditId: row.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}
