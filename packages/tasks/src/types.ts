/**
 * Shared types for the @sparkflow/tasks autonomous task engine (WP-C4).
 *
 * A "task" is a goal-oriented, multi-step unit of work that the engine
 * plans, executes, and persists end-to-end. Tasks can pause for user
 * input (`waiting`) and resume later; they can be cancelled mid-flight.
 */

export type TaskState =
  | "queued"
  | "planning"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * DB mirror. Kept structurally identical to the `tasks` row shape so
 * callers can pass a drizzle select straight in without a conversion.
 * Dates are `Date` to match drizzle's postgres-js adapter output.
 */
export type TaskRecord = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  status: TaskState;
  input: { goal: string; context?: Record<string, unknown> } & Record<string, unknown>;
  output: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type TaskStepKind = "tool_call" | "llm" | "agent" | "delay" | "decision";

export type TaskStepState = "pending" | "running" | "done" | "error";

export type TaskStep = {
  id: string;
  taskIndex: number;
  kind: TaskStepKind;
  state: TaskStepState;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  endedAt?: Date;
};

export type TaskPlanStep = {
  kind: TaskStepKind;
  description: string;
  /** Optional JSON-schema-like hint describing the expected input payload. */
  inputSchema?: unknown;
};

export type TaskPlan = {
  goal: string;
  steps: TaskPlanStep[];
};

/**
 * Streamed events emitted by `TaskExecutor.run()`. Consumers (API SSE
 * routes, UI components, evals) subscribe to these to render live
 * progress.
 */
export type TaskEvent =
  | { type: "plan"; payload: { plan: TaskPlan } }
  | { type: "step_start"; payload: { step: TaskStep } }
  | { type: "step_end"; payload: { step: TaskStep } }
  | { type: "waiting"; payload: { reason: string; stepIndex: number } }
  | { type: "cancelled"; payload: { stepIndex: number } }
  | { type: "finish"; payload: { output: unknown } }
  | { type: "error"; payload: { message: string; stepIndex?: number } };

/**
 * Thrown by a step handler to signal that the task should pause and
 * move to the `waiting` state. The executor catches this and emits a
 * `waiting` event rather than failing the task.
 */
export class TaskPausedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Task paused: ${reason}`);
    this.name = "TaskPausedError";
    this.reason = reason;
  }
}

/**
 * Thrown internally when we detect that a task row has transitioned to
 * `cancelled` out-of-band. The executor catches this, emits a final
 * `error` event with a cancellation message, and stops yielding.
 */
export class TaskCancelledError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} was cancelled`);
    this.name = "TaskCancelledError";
  }
}
