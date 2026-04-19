/**
 * /api/marketplace/listings — browse and publish marketplace listings.
 *
 * GET:  filters by kind / q / tag, sorts by installs | rating | recent.
 *       Private and unlisted listings only surface to the publishing
 *       org — handled inside `listListings` via `viewerOrganizationId`.
 * POST: publishes a new listing from the caller's org. Requires a
 *       session. Runs a secret-string safety scan (see `publishListing`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  ListingSafetyError,
  listListings,
  publishListing,
  type ListingKind,
  type ListingSort,
} from "@sparkflow/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTING_KINDS = ["agent", "tool", "workflow"] as const;
const LISTING_SORTS = ["installs", "rating", "recent"] as const;

const publishSchema = z.object({
  kind: z.enum(LISTING_KINDS),
  title: z.string().min(2).max(120),
  description: z.string().min(10).max(4000),
  entity: z.record(z.unknown()),
  price: z.number().int().nonnegative().optional(),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const sortParam = url.searchParams.get("sort");

  const kind: ListingKind | undefined =
    kindParam && (LISTING_KINDS as ReadonlyArray<string>).includes(kindParam)
      ? (kindParam as ListingKind)
      : undefined;
  const sort: ListingSort | undefined =
    sortParam && (LISTING_SORTS as ReadonlyArray<string>).includes(sortParam)
      ? (sortParam as ListingSort)
      : undefined;

  const q = url.searchParams.get("q") ?? undefined;
  const tag = url.searchParams.get("tag") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  const listings = await listListings({
    kind,
    q: q ?? undefined,
    tag: tag ?? undefined,
    sort,
    viewerOrganizationId: session.organizationId,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return NextResponse.json({ listings });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const listing = await publishListing({
      ...parsed.data,
      publisherOrganizationId: session.organizationId,
      publisherUserId: session.user.id,
    });
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err) {
    if (err instanceof ListingSafetyError) {
      return NextResponse.json(
        {
          error: "safety_check_failed",
          message: err.message,
          matches: err.matches,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error: "publish_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 400 },
    );
  }
}
