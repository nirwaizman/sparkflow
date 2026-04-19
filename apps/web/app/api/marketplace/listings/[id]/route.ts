/**
 * /api/marketplace/listings/[id] — listing detail including reviews.
 *
 * Visibility rules:
 *   - public    — anyone authenticated can fetch.
 *   - unlisted  — only fetchable by direct id (we're already here).
 *   - private   — only the publishing org can fetch.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@sparkflow/auth";
import { getListing, listReviews } from "@sparkflow/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const listing = await getListing(id);
  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (
    listing.visibility === "private" &&
    listing.publisherOrganizationId !== session.organizationId
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const reviews = await listReviews(listing.id);
  return NextResponse.json({ listing, reviews });
}
