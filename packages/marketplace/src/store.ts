/**
 * In-memory store for marketplace listings, installs, and reviews.
 *
 * TODO(persistence): replace the Maps below with drizzle-backed queries
 * against `marketplace_listings`, `marketplace_installs`, and
 * `marketplace_reviews` tables. The public function signatures in this
 * module are the contract — keep them stable so API routes and UI
 * pages don't need to change when the DB lands.
 */

import type {
  Install,
  InstallId,
  Listing,
  ListingFilters,
  ListingId,
  ListingSort,
  Review,
  ReviewId,
} from "./types";

// ---------- storage -----------------------------------------------------

const listingsTable = new Map<ListingId, Listing>();
const installsTable = new Map<InstallId, Install>();
const reviewsTable = new Map<ReviewId, Review>();

// ---------- helpers -----------------------------------------------------

export function uid(prefix: string): string {
  // Deterministic enough for in-memory usage. Swap for `nanoid` /
  // `crypto.randomUUID()` once we move to DB.
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function normaliseTags(
  tags: ReadonlyArray<string> | undefined,
): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function matchesFilters(l: Listing, f: ListingFilters): boolean {
  // Visibility gate: public is always visible; private / unlisted are
  // only visible to the publishing org.
  if (l.visibility !== "public") {
    if (f.viewerOrganizationId !== l.publisherOrganizationId) return false;
  }
  if (f.kind && l.kind !== f.kind) return false;
  if (f.tag) {
    const needle = f.tag.trim().toLowerCase();
    if (needle && !l.tags.includes(needle)) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q) {
      const hay = `${l.title} ${l.description} ${l.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
  }
  return true;
}

function compareBy(sort: ListingSort): (a: Listing, b: Listing) => number {
  switch (sort) {
    case "installs":
      return (a, b) => b.installCount - a.installCount;
    case "rating":
      return (a, b) => b.ratingAvg - a.ratingAvg;
    case "recent":
    default:
      return (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime();
  }
}

// ---------- listings CRUD ----------------------------------------------

export async function insertListing(row: Listing): Promise<Listing> {
  listingsTable.set(row.id, row);
  return row;
}

export async function getListing(id: ListingId): Promise<Listing | null> {
  return listingsTable.get(id) ?? null;
}

export async function listListings(
  filters: ListingFilters,
): Promise<Listing[]> {
  const sort = filters.sort ?? "recent";
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 500));
  const out: Listing[] = [];
  for (const l of listingsTable.values()) {
    if (matchesFilters(l, filters)) out.push(l);
  }
  out.sort(compareBy(sort));
  return out.slice(0, limit);
}

export async function updateListingAggregates(
  id: ListingId,
  patch: Partial<
    Pick<Listing, "installCount" | "ratingAvg" | "ratingCount" | "updatedAt">
  >,
): Promise<Listing | null> {
  const existing = listingsTable.get(id);
  if (!existing) return null;
  const next: Listing = {
    ...existing,
    installCount: patch.installCount ?? existing.installCount,
    ratingAvg: patch.ratingAvg ?? existing.ratingAvg,
    ratingCount: patch.ratingCount ?? existing.ratingCount,
    updatedAt: patch.updatedAt ?? new Date(),
  };
  listingsTable.set(id, next);
  return next;
}

// ---------- installs ---------------------------------------------------

export async function insertInstall(row: Install): Promise<Install> {
  installsTable.set(row.id, row);
  return row;
}

export async function findInstall(
  listingId: ListingId,
  organizationId: string,
): Promise<Install | null> {
  for (const i of installsTable.values()) {
    if (i.listingId === listingId && i.organizationId === organizationId) {
      return i;
    }
  }
  return null;
}

export async function listInstallsForOrg(
  organizationId: string,
): Promise<Install[]> {
  const out: Install[] = [];
  for (const i of installsTable.values()) {
    if (i.organizationId === organizationId) out.push(i);
  }
  out.sort((a, b) => b.installedAt.getTime() - a.installedAt.getTime());
  return out;
}

export async function countInstallsForListing(
  listingId: ListingId,
): Promise<number> {
  let count = 0;
  for (const i of installsTable.values()) {
    if (i.listingId === listingId) count += 1;
  }
  return count;
}

// ---------- reviews ----------------------------------------------------

export async function insertReview(row: Review): Promise<Review> {
  reviewsTable.set(row.id, row);
  return row;
}

export async function listReviewsForListing(
  listingId: ListingId,
): Promise<Review[]> {
  const out: Review[] = [];
  for (const r of reviewsTable.values()) {
    if (r.listingId === listingId) out.push(r);
  }
  out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return out;
}

export async function findReviewByUser(
  listingId: ListingId,
  reviewerUserId: string,
): Promise<Review | null> {
  for (const r of reviewsTable.values()) {
    if (r.listingId === listingId && r.reviewerUserId === reviewerUserId) {
      return r;
    }
  }
  return null;
}

/**
 * Recomputes (ratingAvg, ratingCount) from the reviews table.
 * Intended to be called from the reviews module after a write.
 */
export async function recomputeListingRating(
  listingId: ListingId,
): Promise<{ ratingAvg: number; ratingCount: number }> {
  let sum = 0;
  let count = 0;
  for (const r of reviewsTable.values()) {
    if (r.listingId !== listingId) continue;
    sum += r.rating;
    count += 1;
  }
  const avg = count === 0 ? 0 : sum / count;
  return { ratingAvg: avg, ratingCount: count };
}

// ---------- test helpers ------------------------------------------------

/** @internal Clears the in-memory store; intended for tests only. */
export function __resetStoreForTests(): void {
  listingsTable.clear();
  installsTable.clear();
  reviewsTable.clear();
}
