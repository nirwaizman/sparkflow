import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const taskStatusEnum = pgEnum("task_status", [
  "queued",
  "planning",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: taskStatusEnum("status").notNull().default("queued"),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index("tasks_org_idx").on(t.organizationId),
    userIdx: index("tasks_user_idx").on(t.userId),
    statusIdx: index("tasks_status_idx").on(t.status),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
