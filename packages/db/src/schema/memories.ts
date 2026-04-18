import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";
import { memoryScopeEnum } from "./agents";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Long-term memory store. Reuses `memoryScopeEnum` from `agents.ts` so the
 * two stay in lock-step (`session | user | workspace | global`).
 *
 * The IVFFlat index on `embedding` is emitted by `POST_MIGRATION_SQL` in
 * `_extensions.ts` (drizzle-kit can't express IVFFlat natively).
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: memoryScopeEnum("scope").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("memories_org_user_scope_key_uniq").on(t.organizationId, t.userId, t.scope, t.key),
  }),
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
