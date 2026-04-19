/**
 * Outgoing-webhook dispatcher.
 *
 * `emitEvent({organizationId, event, data})` resolves the matching
 * subscriptions, signs each payload, and POSTs it to the subscriber.
 * Failures are swallowed after being logged — we do NOT want an
 * unhealthy customer endpoint to break the underlying task/workflow/file
 * request.
 *
 * TODO: move to a durable outbox (Inngest / pg-boss) so retries and
 * exponential backoff happen outside the request path.
 */
import { signWebhook, WEBHOOK_SIGNATURE_HEADER } from "@sparkflow/public-api";
import {
  markDelivered,
  subscribersForEvent,
  type WebhookSubscription,
} from "./webhook-store";

export interface EmitEventInput {
  organizationId: string;
  event: string;
  data: Record<string, unknown>;
}

export interface WebhookEventEnvelope {
  id: string;
  event: string;
  createdAt: string;
  data: Record<string, unknown>;
}

function envelope(event: string, data: Record<string, unknown>): WebhookEventEnvelope {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    event,
    createdAt: new Date().toISOString(),
    data,
  };
}

async function deliverOne(
  sub: WebhookSubscription,
  payload: WebhookEventEnvelope,
): Promise<void> {
  const body = JSON.stringify(payload);
  const { header } = signWebhook(body, sub.secret);
  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: header,
        "X-SparkFlow-Event": payload.event,
        "X-SparkFlow-Event-Id": payload.id,
      },
      body,
    });
    markDelivered(sub.id, res.status);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[webhooks] delivery failed", {
      id: sub.id,
      event: payload.event,
      err: err instanceof Error ? err.message : String(err),
    });
    markDelivered(sub.id, 0);
  }
}

/**
 * Fire-and-forget event emitter. Safe to call from request handlers —
 * returns immediately after scheduling deliveries, and never throws.
 */
export function emitEvent(input: EmitEventInput): void {
  const subs = subscribersForEvent(input.organizationId, input.event);
  if (subs.length === 0) return;
  const payload = envelope(input.event, input.data);
  for (const sub of subs) {
    // Do not await — keep the originating request hot-path fast.
    void deliverOne(sub, payload);
  }
}

/**
 * Synchronous version for the `/api/webhooks/:id/test` endpoint, which
 * wants to report the delivery result back to the caller.
 */
export async function deliverTestEvent(
  sub: WebhookSubscription,
  event = "test.ping",
): Promise<{ status: number }> {
  const payload = envelope(event, { message: "SparkFlow test delivery", subscriptionId: sub.id });
  const body = JSON.stringify(payload);
  const { header } = signWebhook(body, sub.secret);
  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: header,
        "X-SparkFlow-Event": payload.event,
        "X-SparkFlow-Event-Id": payload.id,
      },
      body,
    });
    markDelivered(sub.id, res.status);
    return { status: res.status };
  } catch {
    markDelivered(sub.id, 0);
    return { status: 0 };
  }
}
