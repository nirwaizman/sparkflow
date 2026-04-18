import { sql } from "drizzle-orm";
import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const sharedLinkResourceEnum = pgEnum("shared_link_resource", [
  "conversation",
  "workflow",
  "artifact",
]);
export type SharedLinkResource = (typeof sharedLinkResourceEnum.enumValues)[number];

export const sharedLinkVisibilityEnum = pgEnum("shared_link_visibility", ["public", "unlisted"]);
export type SharedLinkVisibility = (typeof sharedLinkVisibilityEnum.enumValues)[number];

export const sharedLinks = pgTable("shared_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  resourceType: sharedLinkResourceEnum("resource_type").notNull(),
  resourceId: uuid("resource_id").notNull(),
  slug: text("slug").notNull().unique(),
  visibility: sharedLinkVisibilityEnum("visibility").notNull().default("unlisted"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SharedLink = typeof sharedLinks.$inferSelect;
export type NewSharedLink = typeof sharedLinks.$inferInsert;
