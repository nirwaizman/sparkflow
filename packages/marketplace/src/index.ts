/**
 * Public entrypoint for @sparkflow/marketplace.
 *
 * This package provides the data-layer + domain logic for the public-ish
 * marketplace where orgs can publish agents / tools / workflows and
 * others can browse, install, and review them. API routes under
 * `apps/web/app/api/marketplace/**` and UI pages under
 * `apps/web/app/(app)/marketplace/**` consume this module.
 */

// Types
export type {
  Listing,
  ListingId,
  ListingKind,
  ListingVisibility,
  ListingFilters,
  ListingSort,
  Install,
  InstallId,
  InstallListingResult,
  PublishListingInput,
  Review,
  ReviewId,
} from "./types";

// Store (listings / installs / reviews CRUD)
export {
  getListing,
  listListings,
  listInstallsForOrg,
  findInstall,
  __resetStoreForTests,
} from "./store";

// Publish
export {
  publishListing,
  scanListingForSecrets,
  ListingSafetyError,
} from "./publish";

// Install
export {
  installListing,
  recordOnlyCloner,
  ListingNotInstallableError,
  type InstallCloner,
  type InstalledKind,
} from "./install";

// Reviews
export {
  submitReview,
  listReviews,
  ReviewValidationError,
  type SubmitReviewInput,
} from "./reviews";
