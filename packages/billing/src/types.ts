/**
 * Shared billing types.
 *
 * `Tier` is the source-of-truth string union used by the billing,
 * entitlements, and web layers. It is aligned with the `subscription_tier`
 * Postgres enum in `@sparkflow/db`.
 *
 * `BillingStatus` mirrors the set of Stripe subscription status values
 * we persist on the `subscriptions` table. Stripe itself may emit more
 * statuses; any unknown value should be coerced to `"incomplete"` before
 * being written.
 *
 * `SubscriptionRecord` is the application-level view of a subscriptions
 * row — same shape as `typeof subscriptions.$inferSelect` but with
 * `status` narrowed to `BillingStatus` instead of plain `string`.
 */
export type Tier = "free" | "pro" | "team" | "enterprise";

export type BillingStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused"
  | "incomplete";

export interface SubscriptionRecord {
  id: string;
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: Tier;
  status: BillingStatus;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Price {
  priceId: string;
  tier: Tier;
  interval: "month" | "year";
  amountUsd: number;
}

/**
 * Narrow helper used when syncing raw Stripe subscription status strings
 * onto our `BillingStatus` union.
 */
export function coerceBillingStatus(raw: string): BillingStatus {
  switch (raw) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "paused":
    case "incomplete":
      return raw;
    case "incomplete_expired":
      return "canceled";
    default:
      return "incomplete";
  }
}
