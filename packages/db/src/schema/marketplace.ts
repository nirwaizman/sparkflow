import { pgTable, uuid, text, timestamp, jsonb, pgEnum, integer, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const listingKindEnum = pgEnum("marketplace_listing_kind", [
  "agent",
  "tool",
  "workflow",
]);

export const listingVisibilityEnum = pgEnum("marketplace_listing_visibility", [
  "public",
  "unlisted",
  "private",
]);

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publisherOrgId: uuid("publisher_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    publisherUserId: uuid("publisher_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: listingKindEnum("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    tags: text("tags").array().notNull().default([] as string[]),
    visibility: listingVisibilityEnum("visibility").notNull().default("public"),
    entity: jsonb("entity").$type<Record<string, unknown>>().notNull(),
    priceUsdCents: integer("price_usd_cents").notNull().default(0),
    installCount: integer("install_count").notNull().default(0),
    avgRating: numeric("avg_rating", { precision: 3, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("marketplace_listings_kind_idx").on(t.kind),
    visIdx: index("marketplace_listings_vis_idx").on(t.visibility),
    publisherIdx: index("marketplace_listings_publisher_idx").on(t.publisherOrgId),
  }),
);

export const marketplaceInstalls = pgTable(
  "marketplace_installs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    installedByUserId: uuid("installed_by_user_id").notNull().references(() => users.id, { onDelete: "set null" }),
    clonedEntityId: uuid("cloned_entity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listingOrgUniq: uniqueIndex("marketplace_installs_listing_org_uniq").on(t.listingId, t.organizationId),
    orgIdx: index("marketplace_installs_org_idx").on(t.organizationId),
  }),
);

export const marketplaceReviews = pgTable(
  "marketplace_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id").notNull().references(() => marketplaceListings.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(), // 1..5
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listingReviewerUniq: uniqueIndex("marketplace_reviews_listing_reviewer_uniq").on(t.listingId, t.reviewerUserId),
    listingIdx: index("marketplace_reviews_listing_idx").on(t.listingId),
  }),
);

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type MarketplaceInstall = typeof marketplaceInstalls.$inferSelect;
export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
