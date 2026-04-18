/**
 * High-level task engine API. Owns the DB row lifecycle; the actual
 * per-step work lives in `TaskExecutor`.
 *
 * NOTE: Real background execution (Inngest / queue) is WP-C4.5. For the
 * WP-C4 scaffold, `runTaskOnce` is the in-process runner — callers that
 * want streaming events should consume `TaskExecutor.run()` directly.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, tasks } from "@sparkflow/db";
import { TaskExecutor } from "./executor";
import type { TaskRecord, TaskState } from "./types";

export type EnqueueTaskInput = {
  organizationId: string;
  userId: string;
  goal: string;
  context?: Record<string, unknown>;
  /** Optional title; defaults to a truncated goal. */
  title?: string;
};

function rowToRecord(row: {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}): TaskRecord {
  const input = (row.input ?? {}) as TaskRecord["input"];
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    title: row.title,
    status: row.status as TaskState,
    input: {
      ...input,
      goal: typeof input.goal === "string" ? input.goal : "",
      context: (input.context as Record<string, unknown> | undefined) ?? undefined,
    },
    output: row.output,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

function truncate(s: string, max = 80): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export async function enqueueTask(input: EnqueueTaskInput): Promise<TaskRecord> {
  const db = getDb();
  const [row] = await db
    .insert(tasks)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      title: input.title ?? truncate(input.goal),
      status: "queued",
      input: { goal: input.goal, context: input.context ?? {} },
    })
    .returning();
  if (!row) {
    throw new Error("Failed to enqueue task: no row returned");
  }
  return rowToRecord(row);
}

export async function runTaskOnce(taskId: string): Promise<TaskRecord> {
  const db = getDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row) throw new Error(`Task ${taskId} not found`);
  const record = rowToRecord(row);

  // Only pick up tasks that are actually runnable. `waiting` tasks are
  // resumable; `completed`/`failed`/`cancelled` are terminal.
  if (!["queued", "waiting"].includes(record.status)) {
    return record;
  }

  const executor = new TaskExecutor();
  // Drain the generator — callers that want streaming should use the
  // executor directly.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for await (const _event of executor.run(record)) {
    // no-op; side effects are persisted inside executor.run
  }

  const [after] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return after ? rowToRecord(after) : record;
}

export async function cancelTask(
  taskId: string,
  actorUserId: string,
): Promise<TaskRecord> {
  const db = getDb();
  const [row] = await db
    .update(tasks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();
  if (!row) throw new Error(`Task ${taskId} not found`);
  // actorUserId is accepted for future audit-log wiring; the column
  // mapping lives with the audit_logs table in @sparkflow/db.
  void actorUserId;
  return rowToRecord(row);
}

export type ListTasksFilter = {
  organizationId: string;
  userId?: string;
  status?: TaskState;
  limit?: number;
};

export async function listTasks(filter: ListTasksFilter): Promise<TaskRecord[]> {
  const db = getDb();
  const conditions = [eq(tasks.organizationId, filter.organizationId)];
  if (filter.userId) conditions.push(eq(tasks.userId, filter.userId));
  if (filter.status) conditions.push(eq(tasks.status, filter.status));

  const rows = await db
    .select()
    .from(tasks)
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(tasks.createdAt))
    .limit(Math.max(1, Math.min(filter.limit ?? 50, 200)));

  return rows.map(rowToRecord);
}

export async function getTask(taskId: string): Promise<TaskRecord | null> {
  const db = getDb();
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return row ? rowToRecord(row) : null;
}
