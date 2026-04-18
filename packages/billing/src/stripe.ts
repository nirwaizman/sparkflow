/**
 * Stripe integration.
 *
 * We keep the Stripe SDK out of the module-load critical path: the
 * singleton is built lazily on the first `getStripe()` call. This keeps
 * TypeScript happy in environments where `stripe` isn't installed yet
 * (fresh checkout, CI before `pnpm install`).
 */
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, subscriptions } from "@sparkflow/db";
import type { Tier, BillingStatus } from "./types";
import { coerceBillingStatus } from "./types";
import { resolvePriceId, tierFromPriceId } from "./tiers";

// ---------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("[@sparkflow/billing] STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(key, {
    // Pin the API version so Stripe never silently upgrades us.
    // Keep in lock-step with `stripe@^17`.
    apiVersion: "2024-11-20.acacia" as unknown as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: "sparkflow", version: "0.0.0" },
  });
  return _stripe;
}

// ---------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------

export interface CreateCheckoutArgs {
  tier: Exclude<Tier, "free">;
  interval: "month" | "year";
  organizationId: string;
  customerEmail: string;
  /** Absolute URL the user returns to after checkout (success or cancel). */
  returnUrl: string;
}

export async function createCheckoutSession(
  args: CreateCheckoutArgs,
): Promise<{ id: string; url: string }> {
  const stripe = getStripe();
  const priceId = resolvePriceId(args.tier, args.interval);

  // If we already have a Stripe customer for this org, re-use it so the
  // portal + subscription history stay linked. Otherwise we let Stripe
  // create one via `customer_email`.
  const existingCustomerId = await lookupCustomerId(args.organizationId);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${args.returnUrl}?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${args.returnUrl}?status=cancel`,
    ...(existingCustomerId
      ? { customer: existingCustomerId }
      : { customer_email: args.customerEmail }),
    client_reference_id: args.organizationId,
    subscription_data: {
      metadata: { organizationId: args.organizationId, tier: args.tier },
    },
    metadata: { organizationId: args.organizationId, tier: args.tier },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("[@sparkflow/billing] Stripe did not return a checkout URL");
  }
  return { id: session.id, url: session.url };
}

// ---------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------

export interface CreatePortalArgs {
  stripeCustomerId: string;
  returnUrl: string;
}

export async function createPortalSession(
  args: CreatePortalArgs,
): Promise<{ url: string }> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: args.stripeCustomerId,
    return_url: args.returnUrl,
  });
  return { url: session.url };
}

// ---------------------------------------------------------------------
// DB sync
// ---------------------------------------------------------------------

async function lookupCustomerId(organizationId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return row?.stripeCustomerId ?? null;
}

/**
 * Upsert a Stripe subscription into the `subscriptions` table. This is
 * idempotent: re-syncing the same event is safe.
 */
export async function syncSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  organizationId: string,
): Promise<void> {
  const db = getDb();

  const firstItem = subscription.items.data[0];
  const priceId = firstItem?.price.id;
  const resolved = priceId ? tierFromPriceId(priceId) : null;
  const tier: Tier = resolved?.tier ?? "free";

  const status: BillingStatus = coerceBillingStatus(subscription.status);
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const cancelAt =
    subscription.cancel_at != null ? new Date(subscription.cancel_at * 1000) : null;

  const values = {
    organizationId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    tier,
    status,
    currentPeriodEnd,
    cancelAt,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.organizationId,
      set: {
        stripeCustomerId: values.stripeCustomerId,
        stripeSubscriptionId: values.stripeSubscriptionId,
        tier: values.tier,
        status: values.status,
        currentPeriodEnd: values.currentPeriodEnd,
        cancelAt: values.cancelAt,
        updatedAt: values.updatedAt,
      },
    });
}

// ---------------------------------------------------------------------
// Webhook dispatch
// ---------------------------------------------------------------------

/**
 * Dispatch a Stripe webhook event to the appropriate handler.
 *
 * We only act on a short list of lifecycle events. Other events are
 * ignored (returning ok) so Stripe stops retrying.
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = extractOrganizationId(sub);
      if (!orgId) return;
      await syncSubscriptionFromStripe(sub, orgId);
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id;
      if (!subId) return;
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subId);
      const orgId = extractOrganizationId(sub);
      if (!orgId) return;
      await syncSubscriptionFromStripe(sub, orgId);
      return;
    }
    default:
      // Ignore unknown events.
      return;
  }
}

function extractOrganizationId(sub: Stripe.Subscription): string | null {
  const meta = sub.metadata as Record<string, string> | null | undefined;
  return meta?.organizationId ?? null;
}

/**
 * Verify a raw webhook payload against `Stripe-Signature`. Route handlers
 * should call this with the raw request body (NOT parsed JSON).
 */
export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string,
): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("[@sparkflow/billing] STRIPE_WEBHOOK_SECRET is not set");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
