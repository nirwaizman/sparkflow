import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const memoryScopeEnum = pgEnum("memory_scope", ["session", "user", "workspace", "global"]);
export type MemoryScope = (typeof memoryScopeEnum.enumValues)[number];

/**
 * Agent definitions. `organization_id` is nullable — null rows are the
 * platform-wide built-in agents shipped by SparkFlow. Org rows are user-
 * defined agents scoped to that org.
 */
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    description: text("description"),
    systemPrompt: text("system_prompt").notNull(),
    tools: jsonb("tools").notNull().default(sql`'[]'::jsonb`),
    memoryScope: memoryScopeEnum("memory_scope").notNull().default("session"),
    model: text("model"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgNameIdx: index("agents_org_name_idx").on(t.organizationId, t.name),
  }),
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
