export const dynamic = "force-dynamic";

/**
 * /marketplace/[id] — listing detail page.
 *
 * Server-renders the listing and its reviews, then hands off to the
 * client-side `<ListingActions />` component for the install button
 * and review form.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import {
  getListing,
  listReviews,
  type Listing,
  type Review,
} from "@sparkflow/marketplace";
import { ListingActions } from "./listing-actions";

function formatRating(n: number): string {
  if (n === 0) return "unrated";
  return `${n.toFixed(1)} / 5`;
}

function kindBadgeClass(kind: Listing["kind"]): string {
  switch (kind) {
    case "agent":
      return "bg-purple-100 text-purple-700";
    case "tool":
      return "bg-emerald-100 text-emerald-700";
    case "workflow":
      return "bg-amber-100 text-amber-700";
  }
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span aria-label={`${review.rating} stars`}>
          {"★".repeat(review.rating)}
          <span className="text-neutral-300">
            {"★".repeat(5 - review.rating)}
          </span>
        </span>
        <time
          className="text-xs text-neutral-500"
          dateTime={new Date(review.createdAt).toISOString()}
        >
          {new Date(review.createdAt).toLocaleDateString()}
        </time>
      </div>
      {review.body ? (
        <p className="text-sm text-neutral-700">{review.body}</p>
      ) : (
        <p className="text-sm italic text-neutral-400">No comment</p>
      )}
    </li>
  );
}

export default async function ListingDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await props.params;

  const listing = await getListing(id);
  if (!listing) notFound();
  if (
    listing.visibility === "private" &&
    listing.publisherOrganizationId !== session.organizationId
  ) {
    notFound();
  }

  const reviews = await listReviews(id);
  const isOwnListing =
    listing.publisherOrganizationId === session.organizationId;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-4 text-sm">
        <Link href="/marketplace" className="text-neutral-500 hover:underline">
          ← Back to marketplace
        </Link>
      </nav>

      <header className="mb-6 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${kindBadgeClass(
              listing.kind,
            )}`}
          >
            {listing.kind}
          </span>
          {listing.visibility !== "public" ? (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">
              {listing.visibility}
            </span>
          ) : null}
          {listing.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700"
            >
              #{t}
            </span>
          ))}
        </div>

        <h1 className="text-2xl font-semibold">{listing.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">
          {listing.description}
        </p>

        <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">Installs</dt>
            <dd className="font-medium">{listing.installCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Rating</dt>
            <dd className="font-medium">
              {formatRating(listing.ratingAvg)}
              <span className="ml-1 text-xs text-neutral-400">
                ({listing.ratingCount})
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Price</dt>
            <dd className="font-medium">
              {!listing.price || listing.price === 0
                ? "Free"
                : `$${(listing.price / 100).toFixed(2)}`}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <ListingActions
            listingId={listing.id}
            kind={listing.kind}
            isOwnListing={isOwnListing}
          />
        </div>
      </header>

      <section aria-labelledby="reviews-heading">
        <h2
          id="reviews-heading"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500"
        >
          Reviews ({reviews.length})
        </h2>
        {reviews.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-neutral-500">
            No reviews yet. Be the first to share your experience.
          </p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
