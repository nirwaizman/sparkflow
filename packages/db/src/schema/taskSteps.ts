import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

export const taskStepStateEnum = pgEnum("task_step_state", ["pending", "running", "done", "error"]);
export type TaskStepState = (typeof taskStepStateEnum.enumValues)[number];

/**
 * `kind` is intentionally free-form text (e.g. "tool_call", "llm", "delay",
 * "branch", ...). New step kinds ship with agent/tool changes and should
 * not require a schema migration.
 */
export const taskSteps = pgTable(
  "task_steps",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    kind: text("kind").notNull(),
    state: taskStepStateEnum("state").notNull().default("pending"),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    taskStepIdx: index("task_steps_task_step_idx").on(t.taskId, t.stepIndex),
  }),
);

export type TaskStep = typeof taskSteps.$inferSelect;
export type NewTaskStep = typeof taskSteps.$inferInsert;
