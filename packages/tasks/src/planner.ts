/**
 * LLM-backed task planner. Turns a free-text goal into a concrete
 * 3-7 step plan the executor can walk.
 *
 * We use `generateObject` so the shape is validated against zod and
 * callers never have to parse free-form JSON. On persistent validation
 * failure `generateObject` rethrows, which we surface as-is.
 */
import { z } from "zod";
import { generateObject } from "@sparkflow/llm";
import type { TaskPlan } from "./types";

const PLAN_STEP_KINDS = [
  "tool_call",
  "llm",
  "agent",
  "delay",
  "decision",
] as const;

const planStepSchema = z.object({
  kind: z.enum(PLAN_STEP_KINDS),
  description: z.string().min(1),
  inputSchema: z.unknown().optional(),
});

const planSchema = z.object({
  goal: z.string().min(1),
  steps: z.array(planStepSchema).min(1).max(12),
});

const PLANNER_SYSTEM = [
  "You are SparkFlow's autonomous task planner.",
  "Given a user goal, produce a concrete, actionable plan of 3 to 7 steps.",
  "Steps must be independently executable and described in plain language.",
  "Pick each step's `kind` from: tool_call, llm, agent, delay, decision.",
  "Prefer `tool_call` for external lookups, `llm` for reasoning/generation,",
  "`agent` for specialist sub-tasks, `decision` for branching, `delay` for waits.",
  "Return ONLY the structured object — no prose, no commentary.",
].join(" ");

export async function planTask(
  goal: string,
  context?: Record<string, unknown>,
): Promise<TaskPlan> {
  const contextBlock =
    context && Object.keys(context).length > 0
      ? `\n\nAdditional context:\n${JSON.stringify(context, null, 2)}`
      : "";

  const { object } = await generateObject({
    schema: planSchema,
    system: PLANNER_SYSTEM,
    messages: [
      {
        id: "planner-user",
        role: "user",
        content: `Plan the following goal in 3 to 7 concrete steps.\n\nGOAL: ${goal}${contextBlock}`,
      },
    ],
    temperature: 0.2,
  });

  // The schema ensures a non-empty steps array and valid kinds.
  return object satisfies TaskPlan;
}
