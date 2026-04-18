/**
 * Usage metering.
 *
 * Writes to the `usage_records` table and offers aggregations the
 * billing UI and entitlement guard use:
 *
 *   - recordUsage         — insert one row per billable action
 *   - getUsageForPeriod   — aggregate rows over an arbitrary window
 *   - getCurrentMonthCost — cheap shortcut used by cost caps
 *
 * The `costUsd` column is a numeric string in Postgres; we convert to
 * number at the edges so call sites work in plain JS currency floats
 * (billing-grade rounding is Stripe's concern, not ours).
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, usageRecords } from "@sparkflow/db";

export interface RecordUsageArgs {
  organizationId: string;
  userId?: string;
  feature: string;
  provider?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs?: number;
}

export async function recordUsage(args: RecordUsageArgs): Promise<void> {
  const db = getDb();
  await db.insert(usageRecords).values({
    organizationId: args.organizationId,
    userId: args.userId ?? null,
    feature: args.feature,
    provider: args.provider ?? null,
    model: args.model ?? null,
    inputTokens: args.inputTokens | 0,
    outputTokens: args.outputTokens | 0,
    // `numeric` column accepts a string in postgres-js; use toFixed to
    // avoid scientific-notation surprises on very small costs.
    costUsd: args.costUsd.toFixed(6),
    latencyMs: args.latencyMs ?? null,
  });
}

export interface UsagePeriodQuery {
  organizationId: string;
  from: Date;
  to: Date;
  groupBy?: "day" | "feature" | "model";
}

export interface UsageBucket {
  key: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  count: number;
}

export async function getUsageForPeriod(
  q: UsagePeriodQuery,
): Promise<UsageBucket[]> {
  const db = getDb();
  const groupBy = q.groupBy ?? "day";

  const keyCol =
    groupBy === "day"
      ? sql<string>`to_char(${usageRecords.createdAt}, 'YYYY-MM-DD')`
      : groupBy === "feature"
        ? sql<string>`coalesce(${usageRecords.feature}, 'unknown')`
        : sql<string>`coalesce(${usageRecords.model}, 'unknown')`;

  const rows = await db
    .select({
      key: keyCol,
      inputTokens: sql<number>`coalesce(sum(${usageRecords.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${usageRecords.outputTokens}), 0)::int`,
      costUsd: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.organizationId, q.organizationId),
        gte(usageRecords.createdAt, q.from),
        lt(usageRecords.createdAt, q.to),
      ),
    )
    .groupBy(keyCol)
    .orderBy(keyCol);

  type Row = (typeof rows)[number];
  return rows.map((r: Row) => ({
    key: r.key,
    inputTokens: Number(r.inputTokens) || 0,
    outputTokens: Number(r.outputTokens) || 0,
    costUsd: Number(r.costUsd) || 0,
    count: Number(r.count) || 0,
  }));
}

/**
 * Fast path for cost-cap checks. Returns the total USD spent in the
 * calendar month of `now` (defaults to Date.now()).
 */
export async function getCurrentMonthCost(
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [row] = await db
    .select({
      costUsd: sql<string>`coalesce(sum(${usageRecords.costUsd}), 0)::text`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.organizationId, organizationId),
        gte(usageRecords.createdAt, from),
        lt(usageRecords.createdAt, to),
      ),
    );
  return row ? Number(row.costUsd) || 0 : 0;
}

/**
 * Count billable events matching a feature in the last `windowMs`
 * milliseconds. Cheap — used by per-day message quotas.
 */
export async function getFeatureCount(
  organizationId: string,
  feature: string,
  windowMs: number,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const from = new Date(now.getTime() - windowMs);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.organizationId, organizationId),
        eq(usageRecords.feature, feature),
        gte(usageRecords.createdAt, from),
      ),
    );
  return row ? Number(row.count) || 0 : 0;
}
