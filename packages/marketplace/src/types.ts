/**
 * Shared types for the @sparkflow/marketplace feature.
 *
 * A Listing is a published agent / tool / workflow that other orgs can
 * browse and install. Installs are per-organization and clone the
 * underlying entity into the target org's table (agents / workflows) or
 * enable the tool in the org's tool registry. Reviews are simple 1-5
 * star ratings with optional text bodies.
 *
 * TODO(persistence): the canonical tables for this feature are:
 *   - `marketplace_listings` — one row per publish.
 *   - `marketplace_installs` — one row per (listingId, organizationId).
 *   - `marketplace_reviews`  — one row per (listingId, reviewerUserId).
 * The in-memory shapes in ./store.ts mirror the future row shapes so
 * callers don't need to change when the DB lands.
 */

/** Discriminator for what kind of entity is published. */
export type ListingKind = "agent" | "tool" | "workflow";

/** Visibility flag. `public` shows in global browse; `unlisted` is
 * link-only; `private` is only visible to the publishing org (used for
 * drafts). The marketplace grid defaults to public only. */
export type ListingVisibility = "public" | "unlisted" | "private";

export type ListingId = string;
export type InstallId = string;
export type ReviewId = string;

/**
 * A published marketplace listing. `entity` is an opaque snapshot — for
 * agents it's an AgentDefinition shape, for workflows a WorkflowGraph +
 * trigger, for tools a `{ name }` pointer into the platform registry.
 * Keeping this as `Record<string, unknown>` avoids pulling the agents /
 * workflows packages in as hard deps of marketplace.
 */
export type Listing = {
  id: ListingId;
  kind: ListingKind;
  title: string;
  description: string;
  /** The org that published this listing. */
  publisherOrganizationId: string;
  /** The user (within the publisher org) that clicked publish. */
  publisherUserId: string;
  /** Immutable entity snapshot. */
  entity: Record<string, unknown>;
  /** USD cents. 0 (or undefined) = free. */
  price?: number;
  visibility: ListingVisibility;
  tags: string[];
  /** Denormalised aggregates, updated on install / review. */
  installCount: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** A single install of a listing into a target org. */
export type Install = {
  id: InstallId;
  listingId: ListingId;
  organizationId: string;
  /** User that performed the install. */
  installedByUserId: string;
  /**
   * Id of the cloned row in the target org's table (agents / workflows)
   * or the tool name for tool installs. `null` until the clone succeeds.
   */
  installedEntityId: string | null;
  installedAt: Date;
};

export type Review = {
  id: ReviewId;
  listingId: ListingId;
  reviewerUserId: string;
  reviewerOrganizationId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  body: string | null;
  createdAt: Date;
};

// -------- input DTOs --------------------------------------------------

export type PublishListingInput = {
  kind: ListingKind;
  title: string;
  description: string;
  entity: Record<string, unknown>;
  price?: number;
  visibility?: ListingVisibility;
  tags?: string[];
  publisherOrganizationId: string;
  publisherUserId: string;
};

export type InstallListingResult = {
  install: Install;
  /** Kind of the installed entity — mirrors the listing's kind. */
  kind: ListingKind;
};

/** Sort option for the browse grid. */
export type ListingSort = "installs" | "rating" | "recent";

/** Filter accepted by `listListings`. */
export type ListingFilters = {
  kind?: ListingKind;
  q?: string;
  tag?: string;
  sort?: ListingSort;
  /** Include `unlisted` / `private` listings published by this org. */
  viewerOrganizationId?: string;
  limit?: number;
};
