import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/** IPv4/IPv6 CIDR blocks allowed to access an org. Empty = allow all. */
export const orgIpAllowlist = pgTable(
  "org_ip_allowlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cidr: text("cidr").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("org_ip_allowlist_org_idx").on(t.organizationId),
  }),
);

export type OrgIpAllowlistEntry = typeof orgIpAllowlist.$inferSelect;
