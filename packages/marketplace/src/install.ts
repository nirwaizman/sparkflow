/**
 * Install flow for marketplace listings.
 *
 * `installListing` is deliberately generic — it records an install row
 * against the caller's org and delegates the "clone into the target
 * table" work to an injected `InstallCloner`. The API route is where
 * the real cloner is wired up (agents -> `agents` table, workflows ->
 * `workflows` table, tools -> per-org tool registry).
 *
 * Idempotency: calling `installListing` twice for the same
 * (listingId, organizationId) returns the existing install row rather
 * than duplicating it.
 *
 * TODO(persistence): when `marketplace_installs` lands, run the cloner
 * and the install insert in the same transaction so a partial failure
 * doesn't leave an orphaned row in either table.
 */

import {
  countInstallsForListing,
  findInstall,
  getListing,
  insertInstall,
  uid,
  updateListingAggregates,
} from "./store";
import type { Install, InstallListingResult, Listing, ListingKind } from "./types";

/**
 * Caller-provided adapter that performs the actual clone of a listing's
 * entity into the target org's table. Returns the id of the cloned row
 * (or the tool name, for tool installs). `null` is allowed so a tool
 * install can register "enabled" without a separate row.
 */
export type InstallCloner = (args: {
  listing: Listing;
  organizationId: string;
  installedByUserId: string;
}) => Promise<{ installedEntityId: string | null }>;

export class ListingNotInstallableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListingNotInstallableError";
  }
}

/**
 * Install a listing into the caller's org. Safe to call multiple times —
 * returns the existing install on the second call.
 */
export async function installListing(
  listingId: string,
  organizationId: string,
  opts: {
    installedByUserId: string;
    cloner: InstallCloner;
  },
): Promise<InstallListingResult> {
  const listing = await getListing(listingId);
  if (!listing) {
    throw new ListingNotInstallableError(`listing not found: ${listingId}`);
  }
  if (listing.visibility === "private") {
    // Private listings can only be "installed" by their own org (for
    // self-testing). Everything else is a 404.
    if (listing.publisherOrganizationId !== organizationId) {
      throw new ListingNotInstallableError(
        `listing ${listingId} is not available`,
      );
    }
  }

  const existing = await findInstall(listingId, organizationId);
  if (existing) {
    return { install: existing, kind: listing.kind };
  }

  const cloneResult = await opts.cloner({
    listing,
    organizationId,
    installedByUserId: opts.installedByUserId,
  });

  const install: Install = {
    id: uid("mki"),
    listingId,
    organizationId,
    installedByUserId: opts.installedByUserId,
    installedEntityId: cloneResult.installedEntityId,
    installedAt: new Date(),
  };
  await insertInstall(install);

  // Bump the denormalised install count on the listing.
  const installCount = await countInstallsForListing(listingId);
  await updateListingAggregates(listingId, {
    installCount,
    updatedAt: new Date(),
  });

  return { install, kind: listing.kind };
}

/**
 * Default cloner used by tests / local dev that simply records the
 * install with no cloned entity id. Real API routes should pass a
 * cloner that writes into the agents / workflows / tool-registry
 * tables.
 */
export const recordOnlyCloner: InstallCloner = async () => ({
  installedEntityId: null,
});

/** Exported for downstream consumers that want to narrow on `kind`. */
export type InstalledKind = ListingKind;
