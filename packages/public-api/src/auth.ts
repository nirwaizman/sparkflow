/**
 * API key issuance + verification.
 *
 * Keys are minted as `sf_live_<24 url-safe chars>`. We store only the
 * sha256 hex `keyHash` plus a short `keyPrefix` (the first 12 chars of
 * the raw key, i.e. `sf_live_` + 4 chars) for user-facing identification
 * and fast lookups.
 *
 *   sf_live_aB3d...  <-- raw, shown once at creation time
 *           │└─ 24 random chars (base64url, ~144 bits)
 *           └── live/test ring (we only ship `live` today)
 *
 * Verification expects an `Authorization: Bearer <plain-key>` header.
 * We fetch the row by `keyPrefix`, do a constant-time hash compare,
 * reject revoked rows, and bump `lastUsedAt` best-effort.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, apiKeys } from "@sparkflow/db";

export interface VerifiedApiKey {
  apiKeyId: string;
  organizationId: string;
  userId: string;
  scopes: string[];
}

export interface GeneratedApiKey {
  plain: string;
  prefix: string;
  hash: string;
}

const KEY_RING = "sf_live_";
const RANDOM_LEN_BYTES = 18; // 18 bytes → 24 base64url chars.

/**
 * Mint a fresh API key. Returns the raw `plain` string (caller must
 * display exactly once), the short display `prefix`, and the sha256
 * `hash` to persist.
 */
export function generateApiKey(): GeneratedApiKey {
  const random = randomBytes(RANDOM_LEN_BYTES)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, 24);
  const plain = `${KEY_RING}${random}`;
  const prefix = plain.slice(0, 12);
  const hash = hashKey(plain);
  return { plain, prefix, hash };
}

export function hashKey(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Parse `Authorization: Bearer <token>` → raw token. Accepts a bare
 * token for convenience (e.g. `x-api-key` forwarders). Returns null if
 * the token does not look like a SparkFlow key.
 */
export function extractKey(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  const token = trimmed.toLowerCase().startsWith("bearer ")
    ? trimmed.slice(7).trim()
    : trimmed;
  if (!token.startsWith(KEY_RING)) return null;
  if (token.length < KEY_RING.length + 8) return null;
  return token;
}

/**
 * Verify a key. Looks up the row by `keyPrefix`, compares hashes in
 * constant time, enforces `revokedAt IS NULL`, and returns the
 * organization/user/scopes the caller is acting as. Returns null on
 * any failure (caller maps to 401).
 *
 * Note: we intentionally do NOT log the raw key; only the prefix is
 * safe to include in observability. Callers that want audit trails
 * should use the returned `apiKeyId`.
 */
export async function verifyApiKey(
  authHeader: string | null | undefined,
): Promise<VerifiedApiKey | null> {
  const plain = extractKey(authHeader);
  if (!plain) return null;

  const prefix = plain.slice(0, 12);
  const hash = hashKey(plain);

  const db = getDb();
  const rows = await db
    .select({
      id: apiKeys.id,
      organizationId: apiKeys.organizationId,
      userId: apiKeys.userId,
      keyHash: apiKeys.keyHash,
      scopes: apiKeys.scopes,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt)))
    .limit(5);

  let match: (typeof rows)[number] | undefined;
  const expected = Buffer.from(hash, "hex");
  for (const row of rows) {
    if (row.revokedAt) continue;
    const candidate = Buffer.from(row.keyHash, "hex");
    if (candidate.length !== expected.length) continue;
    if (timingSafeEqual(candidate, expected)) {
      match = row;
      break;
    }
  }
  if (!match) return null;

  // Best-effort last-used bump. Never throw.
  try {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, match.id));
  } catch {
    /* swallow */
  }

  return {
    apiKeyId: match.id,
    organizationId: match.organizationId,
    userId: match.userId,
    scopes: match.scopes ?? [],
  };
}
