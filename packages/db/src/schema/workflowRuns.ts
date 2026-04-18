import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workflows } from "./workflows";

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowRunStatus = (typeof workflowRunStatusEnum.enumValues)[number];

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    triggeredBy: text("triggered_by").notNull(),
    status: workflowRunStatusEnum("status").notNull().default("queued"),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    workflowStartedIdx: index("workflow_runs_workflow_started_idx").on(t.workflowId, t.startedAt),
  }),
);

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
