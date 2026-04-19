/**
 * Share links — CRUD over the `shared_links` table.
 *
 * A share link points at a specific resource (conversation / workflow /
 * artifact) inside an organization and exposes it via a URL-safe slug.
 * The `visibility` column distinguishes:
 *   - "public"   — discoverable / indexable, anyone with the slug can read.
 *   - "unlisted" — anyone with the slug can read, not discoverable.
 *
 * Both modes are read-only at the product level — writes still require a
 * session with membership in the owning org. The `expiresAt` column lets
 * us auto-invalidate links; `resolveShareLink` treats expired rows as if
 * they didn't exist.
 *
 * Slugs are generated with `nanoid` using a URL-safe alphabet. 12 chars
 * of nanoid-alphanumeric gives us plenty of entropy (~71 bits) while
 * staying short enough to look nice in a URL.
 */
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import {
  getDb,
  sharedLinks,
  type SharedLink,
  type SharedLinkResource,
  type SharedLinkVisibility,
} from "@sparkflow/db";

const SLUG_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SLUG_LENGTH = 12;
const nano = customAlphabet(SLUG_ALPHABET, SLUG_LENGTH);

export interface CreateShareLinkInput {
  organizationId: string;
  createdBy: string;
  resourceType: SharedLinkResource;
  resourceId: string;
  visibility?: SharedLinkVisibility;
  expiresAt?: Date | null;
  /** Optional explicit slug. Useful in tests; production should let us generate one. */
  slug?: string;
}

export async function createShareLink(
  input: CreateShareLinkInput,
): Promise<SharedLink> {
  const db = getDb();
  const slug = input.slug ?? nano();

  const [row] = await db
    .insert(sharedLinks)
    .values({
      organizationId: input.organizationId,
      createdBy: input.createdBy,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      slug,
      visibility: input.visibility ?? "unlisted",
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("[@sparkflow/realtime] createShareLink: insert returned no row");
  }
  return row;
}

export interface ResolvedShareLink {
  link: SharedLink;
}

/**
 * Resolve a slug to the full row, or `null` if:
 *   - the slug doesn't exist, or
 *   - the row has an `expiresAt` in the past.
 *
 * Callers are expected to authorize read access to the underlying
 * resource themselves (e.g. "public" visibility → no auth, "unlisted" →
 * still no auth because the slug itself is the capability).
 */
export async function resolveShareLink(
  slug: string,
): Promise<ResolvedShareLink | null> {
  if (!slug || slug.length === 0) return null;
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .select()
    .from(sharedLinks)
    .where(
      and(
        eq(sharedLinks.slug, slug),
        // Either never expires, or expires strictly in the future.
        or(isNull(sharedLinks.expiresAt), gt(sharedLinks.expiresAt, now)),
      ),
    )
    .limit(1);
  return row ? { link: row } : null;
}

/**
 * Revoke a share link by slug. Returns `true` if a row was deleted. Used
 * by the UI "disable sharing" action.
 */
export async function revokeShareLink(slug: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(sharedLinks)
    .where(eq(sharedLinks.slug, slug))
    .returning({ id: sharedLinks.id });
  return rows.length > 0;
}
