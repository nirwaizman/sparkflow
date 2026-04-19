/**
 * POST /api/marketplace/listings/[id]/reviews — submit a 1-5 review.
 *
 * Each user has at most one review per listing (replaces on re-submit).
 * Also returns the listing's updated rating aggregates so the client
 * can refresh without a second round-trip.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  ReviewValidationError,
  getListing,
  listReviews,
  submitReview,
} from "@sparkflow/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const listing = await getListing(id);
  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const review = await submitReview({
      listingId: id,
      reviewerUserId: session.user.id,
      reviewerOrganizationId: session.organizationId,
      rating: parsed.data.rating,
      body: parsed.data.body ?? null,
    });
    const updatedListing = await getListing(id);
    const reviews = await listReviews(id);
    return NextResponse.json({
      review,
      listing: updatedListing,
      reviews,
    });
  } catch (err) {
    if (err instanceof ReviewValidationError) {
      return NextResponse.json(
        { error: "invalid_review", message: err.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: "review_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 400 },
    );
  }
}
