/**
 * Feature-flag resolution for server components and server actions.
 *
 * Resolution order for a given `key`:
 *   1. Look up the org-scoped row (if an `organizationId` is supplied).
 *   2. Fall back to the global row (organization_id IS NULL).
 *   3. Fall back to the caller-supplied `defaultValue` (default: `false`).
 *
 * A flag row is considered "on" when:
 *   - `enabled` is true, AND
 *   - a stable hash of `(orgId || userId || "anon") + key` modulo 100
 *     is strictly less than `rolloutPercent` (percentages of 100 short-
 *     circuit the bucketing and always return `true`).
 *
 * All lookups are memoised for the lifetime of a single React render via
 * `React.cache`, so a page/layout that resolves the same flag multiple
 * times (e.g. in separate server components) only hits Postgres once.
 */
import { cache } from "react";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, featureFlags, type FeatureFlag } from "@sparkflow/db";

export interface ResolveContext {
  organizationId?: string | null;
  userId?: string | null;
  defaultValue?: boolean;
}

export interface ResolvedFlag {
  key: string;
  enabled: boolean;
  rolloutPercent: number;
  payload: unknown;
  /** "global" means no org-specific row exists; otherwise the org id. */
  scope: "global" | "org" | "default";
}

/**
 * Stable non-cryptographic hash — FNV-1a 32-bit. Chosen over `String#hash`
 * and over random because:
 *   - deterministic across processes/machines (fleet-wide rollout),
 *   - reasonably well-distributed across common inputs,
 *   - pure JS, no Node crypto (so it also works on the edge runtime).
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiplication, kept in u32 range.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function bucketOn(subject: string, key: string): number {
  return fnv1a(`${subject}:${key}`) % 100;
}

function pickSubject(ctx: ResolveContext): string {
  return ctx.organizationId ?? ctx.userId ?? "anon";
}

function rolloutAllows(row: FeatureFlag, subject: string): boolean {
  if (!row.enabled) return false;
  const pct = row.rolloutPercent;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return bucketOn(subject, row.key) < pct;
}

/**
 * Batch-fetch every flag row relevant to the current caller for the given
 * keys. A single query pulls both the global rows and the tenant rows so
 * we never round-trip twice for the same key.
 */
const fetchFlagRows = cache(
  async (keys: readonly string[], organizationId: string | null | undefined) => {
    if (keys.length === 0) return [] as FeatureFlag[];
    const db = getDb();
    const predicate = organizationId
      ? and(
          inArray(featureFlags.key, keys as string[]),
          or(
            isNull(featureFlags.organizationId),
            eq(featureFlags.organizationId, organizationId),
          ),
        )
      : and(inArray(featureFlags.key, keys as string[]), isNull(featureFlags.organizationId));
    const rows = await db.select().from(featureFlags).where(predicate);
    return rows as FeatureFlag[];
  },
);

/**
 * Resolve a single flag to a boolean. The result is memoised per render.
 */
export const resolveFlag = cache(
  async (key: string, ctx: ResolveContext = {}): Promise<boolean> => {
    const resolved = await resolveFlagDetail(key, ctx);
    return resolved.enabled;
  },
);

/**
 * Same as `resolveFlag`, but also returns the payload and which row was
 * matched. Useful when a component needs to read a JSON config.
 */
export const resolveFlagDetail = cache(
  async (key: string, ctx: ResolveContext = {}): Promise<ResolvedFlag> => {
    const defaultValue = ctx.defaultValue ?? false;
    const rows = await fetchFlagRows([key], ctx.organizationId ?? null);

    const orgRow =
      ctx.organizationId != null
        ? rows.find((r) => r.organizationId === ctx.organizationId && r.key === key)
        : undefined;
    const globalRow = rows.find((r) => r.organizationId === null && r.key === key);
    const row = orgRow ?? globalRow;

    if (!row) {
      return {
        key,
        enabled: defaultValue,
        rolloutPercent: defaultValue ? 100 : 0,
        payload: null,
        scope: "default",
      };
    }

    const subject = pickSubject(ctx);
    return {
      key,
      enabled: rolloutAllows(row, subject),
      rolloutPercent: row.rolloutPercent,
      payload: row.payload,
      scope: row.organizationId ? "org" : "global",
    };
  },
);

/**
 * Evaluate many keys in one DB round-trip. Returns a plain object so the
 * result is trivially serialisable for the `/api/flags/evaluate` route.
 */
export const resolveFlags = cache(
  async (
    keys: readonly string[],
    ctx: ResolveContext = {},
  ): Promise<Record<string, boolean>> => {
    if (keys.length === 0) return {};
    const defaultValue = ctx.defaultValue ?? false;
    const rows = await fetchFlagRows(keys, ctx.organizationId ?? null);
    const subject = pickSubject(ctx);

    const out: Record<string, boolean> = {};
    for (const key of keys) {
      const orgRow =
        ctx.organizationId != null
          ? rows.find(
              (r) => r.organizationId === ctx.organizationId && r.key === key,
            )
          : undefined;
      const globalRow = rows.find((r) => r.organizationId === null && r.key === key);
      const row = orgRow ?? globalRow;
      out[key] = row ? rolloutAllows(row, subject) : defaultValue;
    }
    return out;
  },
);
