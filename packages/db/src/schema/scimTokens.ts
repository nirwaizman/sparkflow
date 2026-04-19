import { pgTable, uuid, timestamp, text, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/** SCIM bearer token hashes, one per org per rotation. Raw tokens never stored. */
export const scimTokens = pgTable(
  "scim_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("scim_tokens_org_idx").on(t.organizationId),
    hashIdx: index("scim_tokens_hash_idx").on(t.tokenHash),
  }),
);

export type ScimToken = typeof scimTokens.$inferSelect;
