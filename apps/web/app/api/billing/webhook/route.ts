/**
 * POST /api/billing/webhook
 *
 * Stripe webhook receiver. Verifies the `Stripe-Signature` header using
 * `STRIPE_WEBHOOK_SECRET`, then dispatches via `handleWebhookEvent`.
 *
 * This route is excluded from auth middleware — Stripe itself calls it
 * with no session cookie. See `apps/web/middleware.ts` (PUBLIC_EXACT).
 *
 * We always return 200 fast on successful signature verification, even
 * if downstream DB writes fail, so Stripe doesn't retry-storm us. Errors
 * are reported to Sentry.
 */
import { NextResponse, type NextRequest } from "next/server";
import { constructWebhookEvent, handleWebhookEvent } from "@sparkflow/billing";
import { captureError, logger } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 400 },
    );
  }

  // Stripe requires the RAW bytes to verify the signature. `req.text()`
  // gives us that as long as the edge runtime hasn't already consumed
  // the stream (we opt into nodejs above to be sure).
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    captureError(err, { route: "billing.webhook", phase: "read_body" });
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  let event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    captureError(err, { route: "billing.webhook", phase: "verify" });
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 400 },
    );
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    captureError(err, {
      route: "billing.webhook",
      phase: "handle",
      eventType: event.type,
      eventId: event.id,
    });
    // Swallow — 200 keeps Stripe from retrying, and the error is
    // captured. A persistent failure will show up in Sentry.
    logger.error(
      { eventType: event.type, eventId: event.id },
      "[billing.webhook] handler failed",
    );
  }

  return NextResponse.json({ received: true });
}
