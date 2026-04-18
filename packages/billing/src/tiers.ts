/**
 * Central tier catalog.
 *
 * The Stripe price IDs are resolved from env so the same code can run
 * against test + live Stripe accounts without a redeploy. Env var names:
 *
 *   STRIPE_PRICE_PRO_MONTHLY      / STRIPE_PRICE_PRO_YEARLY
 *   STRIPE_PRICE_TEAM_MONTHLY     / STRIPE_PRICE_TEAM_YEARLY
 *   STRIPE_PRICE_ENTERPRISE_MONTHLY / STRIPE_PRICE_ENTERPRISE_YEARLY
 *
 * The `free` tier has no Stripe price — it's the implicit default for
 * any org without a row in `subscriptions`. Enterprise is sold-assisted
 * and the env vars are optional; `null` is a legal value.
 */
import type { Tier } from "./types";

export interface TierSpec {
  displayName: string;
  monthlyPriceUsd: number;
  yearlyPriceUsd: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  features: string[];
}

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.length > 0 ? v : null;
}

export const TIERS: Record<Tier, TierSpec> = {
  free: {
    displayName: "Free",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
    features: [
      "10 messages per day",
      "5 files total (5 MB each)",
      "1 active agent",
      "Web search",
    ],
  },
  pro: {
    displayName: "Pro",
    monthlyPriceUsd: 20,
    yearlyPriceUsd: 192,
    stripePriceIdMonthly: env("STRIPE_PRICE_PRO_MONTHLY"),
    stripePriceIdYearly: env("STRIPE_PRICE_PRO_YEARLY"),
    features: [
      "500 messages per day",
      "100 files (50 MB each)",
      "5 active agents",
      "10 active workflows",
      "$25/mo cost cap",
    ],
  },
  team: {
    displayName: "Team",
    monthlyPriceUsd: 50,
    yearlyPriceUsd: 480,
    stripePriceIdMonthly: env("STRIPE_PRICE_TEAM_MONTHLY"),
    stripePriceIdYearly: env("STRIPE_PRICE_TEAM_YEARLY"),
    features: [
      "2,000 messages per day",
      "500 files (100 MB each)",
      "20 active agents",
      "50 active workflows",
      "$100/mo cost cap",
      "Team sharing and roles",
    ],
  },
  enterprise: {
    displayName: "Enterprise",
    monthlyPriceUsd: 0,
    yearlyPriceUsd: 0,
    stripePriceIdMonthly: env("STRIPE_PRICE_ENTERPRISE_MONTHLY"),
    stripePriceIdYearly: env("STRIPE_PRICE_ENTERPRISE_YEARLY"),
    features: [
      "Unlimited usage",
      "SSO/SAML",
      "Audit logs",
      "Dedicated support",
    ],
  },
};

export const ALL_TIERS: readonly Tier[] = ["free", "pro", "team", "enterprise"] as const;

/**
 * Look up the Stripe price ID for a (tier, interval) pair, throwing when
 * the env var is missing. Used by `createCheckoutSession`.
 */
export function resolvePriceId(tier: Tier, interval: "month" | "year"): string {
  const spec = TIERS[tier];
  const id = interval === "month" ? spec.stripePriceIdMonthly : spec.stripePriceIdYearly;
  if (!id) {
    throw new Error(
      `[@sparkflow/billing] Missing Stripe price ID for tier=${tier} interval=${interval}. ` +
        `Set the corresponding STRIPE_PRICE_* env var.`,
    );
  }
  return id;
}

/**
 * Reverse lookup: given a Stripe price ID, find the tier + interval it
 * corresponds to. Used by the webhook sync path.
 */
export function tierFromPriceId(
  priceId: string,
): { tier: Tier; interval: "month" | "year" } | null {
  for (const tier of ALL_TIERS) {
    const spec = TIERS[tier];
    if (spec.stripePriceIdMonthly === priceId) return { tier, interval: "month" };
    if (spec.stripePriceIdYearly === priceId) return { tier, interval: "year" };
  }
  return null;
}
