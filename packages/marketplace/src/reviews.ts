/**
 * Reviews for marketplace listings.
 *
 * Each (listingId, reviewerUserId) pair has at most one review row —
 * `submitReview` upserts so a user editing their review doesn't fan out
 * into a history. Rating must be an integer 1..5; body is optional and
 * bounded to 2000 chars.
 *
 * After every write we recompute (ratingAvg, ratingCount) and stamp
 * them back onto the listing row so the browse grid can sort by rating
 * without scanning the reviews table.
 *
 * TODO(persistence): when `marketplace_reviews` lands, the upsert can
 * use a unique (listingId, reviewerUserId) constraint and the rating
 * recompute can be a single aggregate query.
 */

import {
  findReviewByUser,
  getListing,
  insertReview,
  listReviewsForListing,
  recomputeListingRating,
  uid,
  updateListingAggregates,
} from "./store";
import type { Review, ReviewId } from "./types";

export class ReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewValidationError";
  }
}

function validateRating(rating: number): 1 | 2 | 3 | 4 | 5 {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ReviewValidationError("rating must be an integer 1..5");
  }
  return rating as 1 | 2 | 3 | 4 | 5;
}

function validateBody(body: string | null | undefined): string | null {
  if (body === null || body === undefined) return null;
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 2000) {
    throw new ReviewValidationError("review body must be <= 2000 chars");
  }
  return trimmed;
}

export type SubmitReviewInput = {
  listingId: string;
  reviewerUserId: string;
  reviewerOrganizationId: string;
  rating: number;
  body?: string | null;
};

/**
 * Creates or replaces the reviewer's review for a listing.
 *
 * On replace we issue a new row id (keeping the store shape close to an
 * append-only log) but the `recomputeListingRating` step treats the
 * latest row per reviewer as authoritative via `findReviewByUser`.
 */
export async function submitReview(input: SubmitReviewInput): Promise<Review> {
  const listing = await getListing(input.listingId);
  if (!listing) {
    throw new ReviewValidationError(`listing not found: ${input.listingId}`);
  }

  const rating = validateRating(input.rating);
  const body = validateBody(input.body);

  // Simple replace: if the reviewer already has a review, we give the
  // new one a fresh id and insert it — the aggregate recompute below
  // collapses duplicates by summing everything, so to keep the math
  // honest we reuse the existing id when one exists.
  const existing = await findReviewByUser(
    input.listingId,
    input.reviewerUserId,
  );
  const id: ReviewId = existing?.id ?? uid("mkr");

  const row: Review = {
    id,
    listingId: input.listingId,
    reviewerUserId: input.reviewerUserId,
    reviewerOrganizationId: input.reviewerOrganizationId,
    rating,
    body,
    createdAt: existing?.createdAt ?? new Date(),
  };
  await insertReview(row);

  const { ratingAvg, ratingCount } = await recomputeListingRating(
    input.listingId,
  );
  await updateListingAggregates(input.listingId, {
    ratingAvg,
    ratingCount,
    updatedAt: new Date(),
  });

  return row;
}

export async function listReviews(listingId: string): Promise<Review[]> {
  return listReviewsForListing(listingId);
}
