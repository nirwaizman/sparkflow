import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const scimGroups = pgTable(
  "scim_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDisplayUniq: uniqueIndex("scim_groups_org_display_uniq").on(t.organizationId, t.displayName),
  }),
);

export const scimGroupMembers = pgTable(
  "scim_group_members",
  {
    groupId: uuid("group_id").notNull().references(() => scimGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupIdx: index("scim_group_members_group_idx").on(t.groupId),
    userIdx: index("scim_group_members_user_idx").on(t.userId),
  }),
);

export type ScimGroup = typeof scimGroups.$inferSelect;
export type ScimGroupMember = typeof scimGroupMembers.$inferSelect;
