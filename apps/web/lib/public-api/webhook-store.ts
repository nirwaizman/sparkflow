/**
 * In-memory webhook subscription store.
 *
 * Scoped by organizationId. Subscriptions live only for the lifetime
 * of the process — fine for dev/preview, NOT fine for production.
 *
 * TODO: move to a DB table `webhook_subscriptions(id, organization_id,
 * url, events text[], secret, created_at, last_delivered_at)` and
 * back this module with Drizzle. Keep the exported API identical so
 * callers don't change.
 */
import { randomBytes, randomUUID } from "node:crypto";

export interface WebhookSubscription {
  id: string;
  organizationId: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: string;
  lastDeliveredAt: string | null;
  lastStatus: number | null;
}

export interface CreateWebhookInput {
  organizationId: string;
  url: string;
  events: string[];
  secret?: string;
}

const subscriptions = new Map<string, WebhookSubscription>();

export function createWebhook(input: CreateWebhookInput): WebhookSubscription {
  const id = randomUUID();
  const secret = input.secret ?? `whsec_${randomBytes(18).toString("base64url")}`;
  const row: WebhookSubscription = {
    id,
    organizationId: input.organizationId,
    url: input.url,
    events: [...input.events],
    secret,
    createdAt: new Date().toISOString(),
    lastDeliveredAt: null,
    lastStatus: null,
  };
  subscriptions.set(id, row);
  return row;
}

export function listWebhooks(organizationId: string): WebhookSubscription[] {
  const out: WebhookSubscription[] = [];
  for (const row of subscriptions.values()) {
    if (row.organizationId === organizationId) out.push(row);
  }
  return out;
}

export function getWebhook(
  organizationId: string,
  id: string,
): WebhookSubscription | null {
  const row = subscriptions.get(id);
  if (!row || row.organizationId !== organizationId) return null;
  return row;
}

export function deleteWebhook(organizationId: string, id: string): boolean {
  const row = subscriptions.get(id);
  if (!row || row.organizationId !== organizationId) return false;
  subscriptions.delete(id);
  return true;
}

export function subscribersForEvent(
  organizationId: string,
  event: string,
): WebhookSubscription[] {
  const out: WebhookSubscription[] = [];
  for (const row of subscriptions.values()) {
    if (row.organizationId !== organizationId) continue;
    if (row.events.includes("*") || row.events.includes(event)) {
      out.push(row);
    }
  }
  return out;
}

export function markDelivered(id: string, status: number): void {
  const row = subscriptions.get(id);
  if (!row) return;
  row.lastDeliveredAt = new Date().toISOString();
  row.lastStatus = status;
  subscriptions.set(id, row);
}
