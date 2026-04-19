export const dynamic = "force-dynamic";

/**
 * /marketplace — browse published agents / tools / workflows.
 *
 * Server component that loads an initial page of listings (respecting
 * the caller's org for visibility), then hands off to the client
 * component for filter UX. Filters re-fetch via the `/api/marketplace/
 * listings` endpoint rather than re-rendering the server component so
 * the URL stays clean during rapid filter flicks.
 *
 * TODO(WP-M1.2): add category facets (e.g. research, productivity,
 * marketing) derived from listing tags.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import {
  listListings,
  type Listing,
} from "@sparkflow/marketplace";
import { MarketplaceBrowser } from "./marketplace-browser";

export default async function MarketplacePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const initial: Listing[] = await listListings({
    viewerOrganizationId: session.organizationId,
    sort: "recent",
    limit: 60,
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Marketplace</h1>
          <p className="text-sm text-neutral-500">
            Discover and install agents, tools, and workflows published
            by the community.
          </p>
        </div>
        <Link
          href="/marketplace/publish"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Publish a listing
        </Link>
      </header>
      <MarketplaceBrowser initial={initial} />
    </main>
  );
}
