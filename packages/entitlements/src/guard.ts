/**
 * Entitlement guard.
 *
 * Three entry points:
 *
 *   - resolveTier(orgId)              → "free" | "pro" | "team" | "enterprise"
 *   - checkEntitlement(orgId, key, v) → { allowed, limit, current?, reason? }
 *   - requireEntitlement(orgId, key, v)  throws EntitlementError on deny
 *
 * Quantitative features (`messagesPerDay`, `monthlyCostCapUsd`, etc.)
 * consult the billing meter to compute current usage. Boolean features
 * (`webSearch`) only look at the catalog.
 */
import { eq } from "drizzle-orm";
import { getDb, subscriptions } from "@sparkflow/db";
import type { Tier } from "@sparkflow/billing";
import {
  getCurrentMonthCost,
  getFeatureCount,
} from "@sparkflow/billing";
import { ENTITLEMENTS, type FeatureKey } from "./catalog";

// ---------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------

export class EntitlementError extends Error {
  readonly code: string;
  readonly feature: FeatureKey;
  readonly limit: unknown;
  readonly current: number | undefined;

  constructor(args: {
    message: string;
    feature: FeatureKey;
    limit: unknown;
    current?: number;
    code?: string;
  }) {
    super(args.message);
    this.name = "EntitlementError";
    this.code = args.code ?? "entitlement_exceeded";
    this.feature = args.feature;
    this.limit = args.limit;
    this.current = args.current;
  }
}

// ---------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function resolveTier(organizationId: string): Promise<Tier> {
  const db = getDb();
  const [row] = await db
    .select({
      tier: subscriptions.tier,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  if (!row) return "free";
  if (!ACTIVE_STATUSES.has(row.status)) return "free";
  return row.tier as Tier;
}

// ---------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------

export interface EntitlementResult {
  allowed: boolean;
  limit: unknown;
  current?: number;
  reason?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function checkEntitlement(
  organizationId: string,
  feature: FeatureKey,
  value?: number,
): Promise<EntitlementResult> {
  const tier = await resolveTier(organizationId);
  const tierLimits = ENTITLEMENTS[tier as keyof typeof ENTITLEMENTS];
  const limit = tierLimits[feature];

  // Boolean feature gate.
  if (typeof limit === "boolean") {
    return limit
      ? { allowed: true, limit }
      : { allowed: false, limit, reason: `Feature ${feature} not in ${tier} plan` };
  }

  // Quantitative limit. `Infinity` → always allowed.
  if (typeof limit === "number" && !Number.isFinite(limit)) {
    return { allowed: true, limit };
  }

  const numericLimit = limit as number;
  const delta = value ?? 1;

  switch (feature) {
    case "messagesPerDay": {
      const current = await getFeatureCount(
        organizationId,
        "chat.message",
        MS_PER_DAY,
      );
      const allowed = current + delta <= numericLimit;
      return {
        allowed,
        limit,
        current,
        reason: allowed ? undefined : `Daily message limit (${numericLimit}) reached`,
      };
    }
    case "monthlyCostCapUsd": {
      const current = await getCurrentMonthCost(organizationId);
      const allowed = current + delta <= numericLimit;
      return {
        allowed,
        limit,
        current,
        reason: allowed
          ? undefined
          : `Monthly cost cap ($${numericLimit}) reached`,
      };
    }
    case "maxFileMb": {
      // For this feature `value` is the size of the file being uploaded.
      const size = value ?? 0;
      const allowed = size <= numericLimit;
      return {
        allowed,
        limit,
        current: size,
        reason: allowed ? undefined : `File exceeds ${numericLimit} MB limit`,
      };
    }
    case "filesTotal":
    case "agentsActive":
    case "workflowsActive": {
      // Callers pass the current count via `value` (the guard doesn't
      // own those tables — they're maintained by domain packages). If
      // no value is provided we treat it as a pre-flight check and
      // just return the limit.
      if (value === undefined) {
        return { allowed: true, limit };
      }
      const allowed = value + 1 <= numericLimit;
      return {
        allowed,
        limit,
        current: value,
        reason: allowed ? undefined : `${feature} limit (${numericLimit}) reached`,
      };
    }
    default: {
      // Exhaustiveness: any future FeatureKey falls through to a safe
      // deny rather than a silent allow.
      return {
        allowed: false,
        limit,
        reason: `Unknown feature ${String(feature)}`,
      };
    }
  }
}

// ---------------------------------------------------------------------
// Require
// ---------------------------------------------------------------------

export async function requireEntitlement(
  organizationId: string,
  feature: FeatureKey,
  value?: number,
): Promise<EntitlementResult> {
  const result = await checkEntitlement(organizationId, feature, value);
  if (!result.allowed) {
    throw new EntitlementError({
      message: result.reason ?? `Entitlement denied for ${feature}`,
      feature,
      limit: result.limit,
      current: result.current,
    });
  }
  return result;
}
