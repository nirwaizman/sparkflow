/**
 * `TaskExecutor` walks a planned task through its lifecycle, persisting
 * step rows and emitting `TaskEvent`s for live observation.
 *
 * Design:
 *   - Re-entrancy: if `task_steps` already exist for the task, we pick up
 *     where we left off instead of re-planning. This lets a paused task
 *     (`waiting`) resume cleanly.
 *   - Cancellation: the task row's status is polled before every step;
 *     if a human flipped it to `cancelled`, we short-circuit.
 *   - Retries: transient handler failures get 2 retries with exponential
 *     backoff (200ms, 400ms). Hard failures (TaskPausedError,
 *     TaskCancelledError) are NOT retried.
 */
import { and, asc, eq } from "drizzle-orm";
import { getDb, tasks, taskSteps } from "@sparkflow/db";
import { generate } from "@sparkflow/llm";
import { Agent, taskExecutorAgent } from "@sparkflow/agents";
import { registry as defaultRegistry, registerCoreTools } from "@sparkflow/tools";
import type { ToolRegistry } from "@sparkflow/tools";
import { planTask } from "./planner";
import {
  TaskCancelledError,
  TaskPausedError,
  type TaskEvent,
  type TaskPlan,
  type TaskPlanStep,
  type TaskRecord,
  type TaskStep,
  type TaskStepKind,
} from "./types";

/** Retry policy for transient step errors. */
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [200, 400];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalError(err: unknown): boolean {
  return err instanceof TaskPausedError || err instanceof TaskCancelledError;
}

export class TaskExecutor {
  private readonly registry: ToolRegistry;

  constructor(registry?: ToolRegistry) {
    // Ensure the core tools are present on whichever registry we end up using.
    this.registry = registry ?? registerCoreTools(defaultRegistry);
  }

  /**
   * Run a task. Emits events in order and persists every transition.
   * Safe to consume as an async generator for SSE streaming.
   */
  async *run(task: TaskRecord): AsyncGenerator<TaskEvent> {
    const db = getDb();

    // 1. Resolve the plan: reload from task_steps if present, else plan now.
    const existingStepRows = await db
      .select()
      .from(taskSteps)
      .where(eq(taskSteps.taskId, task.id))
      .orderBy(asc(taskSteps.stepIndex));

    let plan: TaskPlan;
    if (existingStepRows.length > 0) {
      plan = {
        goal: task.input.goal,
        steps: existingStepRows.map((r) => ({
          kind: r.kind as TaskStepKind,
          description:
            ((r.input as Record<string, unknown>)?.description as string) ??
            r.kind,
          inputSchema: (r.input as Record<string, unknown>)?.inputSchema,
        })),
      };
    } else {
      await this.updateStatus(task.id, "planning");
      try {
        plan = await planTask(task.input.goal, task.input.context);
      } catch (err) {
        await this.finishFailed(task.id, err);
        yield {
          type: "error",
          payload: { message: errMsg(err) },
        };
        return;
      }
      // Persist the planned steps as pending rows so resumption works.
      await db.insert(taskSteps).values(
        plan.steps.map((s, idx) => ({
          taskId: task.id,
          stepIndex: idx,
          kind: s.kind,
          state: "pending" as const,
          input: { description: s.description, inputSchema: s.inputSchema ?? null },
        })),
      );
      yield { type: "plan", payload: { plan } };
    }

    // 2. Execute each step in order.
    await this.updateStatus(task.id, "running");
    let lastOutput: unknown = null;

    for (let i = 0; i < plan.steps.length; i++) {
      if (await this.isCancelled(task.id)) {
        yield {
          type: "error",
          payload: { message: "cancelled", stepIndex: i },
        };
        return;
      }

      const planStep = plan.steps[i];
      if (!planStep) continue;

      // Skip steps that already completed in a previous run.
      const existing = existingStepRows.find((r) => r.stepIndex === i);
      if (existing && existing.state === "done") {
        lastOutput = existing.output;
        continue;
      }

      const stepRow = existing
        ? existing
        : (
            await db
              .select()
              .from(taskSteps)
              .where(
                and(
                  eq(taskSteps.taskId, task.id),
                  eq(taskSteps.stepIndex, i),
                ),
              )
              .limit(1)
          )[0];
      if (!stepRow) continue;

      const startedAt = new Date();
      const stepView: TaskStep = {
        id: stepRow.id,
        taskIndex: i,
        kind: planStep.kind,
        state: "running",
        input: (stepRow.input as Record<string, unknown>) ?? {},
        startedAt,
      };
      await db
        .update(taskSteps)
        .set({ state: "running", startedAt })
        .where(eq(taskSteps.id, stepRow.id));
      yield { type: "step_start", payload: { step: stepView } };

      try {
        const output = await this.runStepWithRetries(planStep, lastOutput);
        const endedAt = new Date();
        await db
          .update(taskSteps)
          .set({
            state: "done",
            output: serializable(output),
            endedAt,
          })
          .where(eq(taskSteps.id, stepRow.id));
        lastOutput = output;
        yield {
          type: "step_end",
          payload: {
            step: { ...stepView, state: "done", output, endedAt },
          },
        };
      } catch (err) {
        const endedAt = new Date();
        if (err instanceof TaskPausedError) {
          await db
            .update(taskSteps)
            .set({ state: "pending", endedAt: null })
            .where(eq(taskSteps.id, stepRow.id));
          await this.updateStatus(task.id, "waiting");
          yield {
            type: "waiting",
            payload: { reason: err.reason, stepIndex: i },
          };
          return;
        }
        if (err instanceof TaskCancelledError) {
          yield {
            type: "error",
            payload: { message: "cancelled", stepIndex: i },
          };
          return;
        }
        await db
          .update(taskSteps)
          .set({ state: "error", endedAt })
          .where(eq(taskSteps.id, stepRow.id));
        await this.finishFailed(task.id, err);
        yield {
          type: "error",
          payload: { message: errMsg(err), stepIndex: i },
        };
        return;
      }
    }

    // 3. Mark completed.
    await db
      .update(tasks)
      .set({
        status: "completed",
        output: serializable(lastOutput),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
    yield { type: "finish", payload: { output: lastOutput } };
  }

  // --- internals ---------------------------------------------------------

  private async runStepWithRetries(
    step: TaskPlanStep,
    previousOutput: unknown,
  ): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.runStep(step, previousOutput);
      } catch (err) {
        if (isTerminalError(err)) throw err;
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 400);
          continue;
        }
      }
    }
    throw lastErr;
  }

  /**
   * Dispatch a single step to its handler.
   *
   * - `agent` — run the generalist task-executor agent on the description.
   * - `tool_call` — look up a tool whose name appears in the description or
   *    inputSchema.name; fall back to the LLM if we can't resolve one.
   * - `llm` / `decision` — run a one-shot LLM completion with the
   *    description and the previous step's output as context.
   * - `delay` — honour an `inputSchema.ms` hint (default 500ms).
   */
  private async runStep(
    step: TaskPlanStep,
    previousOutput: unknown,
  ): Promise<unknown> {
    switch (step.kind) {
      case "delay": {
        const ms =
          Number((step.inputSchema as { ms?: number } | undefined)?.ms) || 500;
        await sleep(Math.min(ms, 30_000));
        return { waitedMs: ms };
      }
      case "tool_call": {
        const name = (step.inputSchema as { name?: string } | undefined)?.name;
        if (name && this.registry.has(name)) {
          const reg = this.registry.get(name)!;
          const args =
            (step.inputSchema as { args?: Record<string, unknown> } | undefined)
              ?.args ?? {};
          const parsed = reg.tool.parameters.parse(args);
          return await reg.tool.handler(parsed);
        }
        // Unknown tool — let the LLM describe what would have happened so
        // the task can still progress in dev / demo environments.
        return await this.runLlmStep(step, previousOutput);
      }
      case "agent": {
        const agent = new Agent(taskExecutorAgent, this.registry);
        const prompt = buildStepPrompt(step, previousOutput);
        const result = await agent.run({ prompt });
        return { content: result.content, toolCalls: result.toolCalls };
      }
      case "llm":
      case "decision":
      default:
        return await this.runLlmStep(step, previousOutput);
    }
  }

  private async runLlmStep(
    step: TaskPlanStep,
    previousOutput: unknown,
  ): Promise<unknown> {
    const prompt = buildStepPrompt(step, previousOutput);
    const result = await generate({
      system:
        "You are executing a single step of a larger task. Respond concisely with the step's output.",
      messages: [{ id: "step-user", role: "user", content: prompt }],
      temperature: 0.3,
    });
    return { content: result.content };
  }

  private async updateStatus(
    taskId: string,
    status: TaskRecord["status"],
  ): Promise<void> {
    const db = getDb();
    await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }

  private async finishFailed(taskId: string, err: unknown): Promise<void> {
    const db = getDb();
    await db
      .update(tasks)
      .set({
        status: "failed",
        error: errMsg(err),
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }

  private async isCancelled(taskId: string): Promise<boolean> {
    const db = getDb();
    const [row] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    return row?.status === "cancelled";
  }
}

function buildStepPrompt(
  step: TaskPlanStep,
  previousOutput: unknown,
): string {
  const prev =
    previousOutput === null || previousOutput === undefined
      ? ""
      : `\n\nPrevious step output:\n${safeStringify(previousOutput)}`;
  return `Step (${step.kind}): ${step.description}${prev}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Best-effort conversion for jsonb columns — strips functions/undefined. */
function serializable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}
