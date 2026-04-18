/**
 * Workflow runtime. Walks a `WorkflowGraph` and emits the same
 * `TaskEvent` union the task engine uses so the UI can subscribe to a
 * single event shape regardless of origin.
 *
 * The runtime is intentionally small:
 *   - sequential walks via `next[0]`
 *   - condition branches via `next[0]` (true) / `next[1]` (false)
 *   - loops bounded by `config.maxIterations` to avoid runaway runs
 *
 * Complex patterns (parallel fan-out, retries, sub-workflow calls) are
 * left for WP-C5.1+.
 */
import { eq } from "drizzle-orm";
import { getDb, workflowRuns } from "@sparkflow/db";
import { generate } from "@sparkflow/llm";
import { registry as defaultRegistry, registerCoreTools } from "@sparkflow/tools";
import type { ToolRegistry } from "@sparkflow/tools";
import type { TaskEvent, TaskStep } from "@sparkflow/tasks";
import type {
  NodeKind,
  WorkflowDefinition,
  WorkflowNode,
} from "./types";

export type WorkflowRunContext = {
  organizationId: string;
  userId?: string;
};

/** Hard cap on nodes visited per run to avoid accidental infinite loops. */
const MAX_NODES_VISITED = 256;

export async function* runWorkflow(
  def: WorkflowDefinition,
  input: unknown,
  ctx: WorkflowRunContext,
  registry?: ToolRegistry,
): AsyncGenerator<TaskEvent> {
  const db = getDb();
  const reg = registry ?? registerCoreTools(defaultRegistry);

  // Persist the run row so we have a cancellation / history anchor.
  const [runRow] = await db
    .insert(workflowRuns)
    .values({
      workflowId: def.id,
      triggeredBy: ctx.userId ?? `trigger:${def.trigger.kind}`,
      status: "running",
      input: (input ?? {}) as object,
      startedAt: new Date(),
    })
    .returning();
  const runId = runRow?.id;

  const nodeMap = new Map(def.graph.nodes.map((n) => [n.id, n]));
  const entry = nodeMap.get(def.graph.entryNodeId);
  if (!entry) {
    yield {
      type: "error",
      payload: { message: `entry node ${def.graph.entryNodeId} not found` },
    };
    if (runId) {
      await db
        .update(workflowRuns)
        .set({ status: "failed", endedAt: new Date() })
        .where(eq(workflowRuns.id, runId));
    }
    return;
  }

  const state: Record<string, unknown> = {};
  let previous: unknown = input;
  let current: WorkflowNode | undefined = entry;
  let stepIndex = 0;
  let visited = 0;
  let finalOutput: unknown = input;

  try {
    while (current && visited < MAX_NODES_VISITED) {
      visited++;
      const stepView: TaskStep = {
        id: current.id,
        taskIndex: stepIndex++,
        kind: nodeKindToStepKind(current.kind),
        state: "running",
        input: current.config,
        startedAt: new Date(),
      };
      yield { type: "step_start", payload: { step: stepView } };

      const { output, nextId } = await executeNode(current, {
        input,
        previous,
        state,
        reg,
      });

      const endedAt = new Date();
      yield {
        type: "step_end",
        payload: {
          step: { ...stepView, state: "done", output, endedAt },
        },
      };

      previous = output;
      finalOutput = output;
      current = nextId ? nodeMap.get(nextId) : undefined;
    }

    if (runId) {
      await db
        .update(workflowRuns)
        .set({
          status: "completed",
          output: toJson(finalOutput),
          endedAt: new Date(),
        })
        .where(eq(workflowRuns.id, runId));
    }
    yield { type: "finish", payload: { output: finalOutput } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) {
      await db
        .update(workflowRuns)
        .set({ status: "failed", endedAt: new Date() })
        .where(eq(workflowRuns.id, runId));
    }
    yield { type: "error", payload: { message } };
  }
}

// --- node dispatch -------------------------------------------------------

type ExecEnv = {
  input: unknown;
  previous: unknown;
  state: Record<string, unknown>;
  reg: ToolRegistry;
};

async function executeNode(
  node: WorkflowNode,
  env: ExecEnv,
): Promise<{ output: unknown; nextId: string | undefined }> {
  switch (node.kind) {
    case "trigger":
    case "output": {
      return {
        output: env.previous,
        nextId: node.next?.[0],
      };
    }
    case "llm": {
      const prompt =
        (node.config.prompt as string | undefined) ??
        (typeof env.previous === "string"
          ? env.previous
          : JSON.stringify(env.previous));
      const result = await generate({
        system:
          (node.config.system as string | undefined) ??
          "You are a workflow step. Respond concisely.",
        messages: [{ id: node.id, role: "user", content: prompt }],
        temperature: (node.config.temperature as number | undefined) ?? 0.3,
      });
      return { output: result.content, nextId: node.next?.[0] };
    }
    case "tool": {
      const name = node.config.name as string | undefined;
      if (!name || !env.reg.has(name)) {
        throw new Error(
          `tool node ${node.id}: unknown tool "${name ?? "(missing)"}"`,
        );
      }
      const toolReg = env.reg.get(name)!;
      const args = (node.config.args as Record<string, unknown> | undefined) ?? {};
      const parsed = toolReg.tool.parameters.parse(args);
      const output = await toolReg.tool.handler(parsed);
      return { output, nextId: node.next?.[0] };
    }
    case "agent": {
      // Agents are first-class in @sparkflow/agents; for the WP-C5
      // scaffold we route `agent` nodes through a plain LLM call with
      // the agent's id as a tag. Full agent dispatch lands with WP-C5.1
      // when the agent registry becomes workspace-scoped.
      const agentId = (node.config.agentId as string | undefined) ?? "generalist";
      const prompt =
        (node.config.prompt as string | undefined) ??
        (typeof env.previous === "string"
          ? env.previous
          : JSON.stringify(env.previous));
      const result = await generate({
        system: `You are the "${agentId}" agent. Respond in character.`,
        messages: [{ id: node.id, role: "user", content: prompt }],
        temperature: 0.4,
      });
      return { output: result.content, nextId: node.next?.[0] };
    }
    case "condition": {
      const truthy = evalCondition(node.condition, env);
      const nextId = truthy ? node.next?.[0] : node.next?.[1];
      return { output: { branch: truthy ? "true" : "false" }, nextId };
    }
    case "loop": {
      const max = Math.max(
        1,
        Math.min((node.config.maxIterations as number | undefined) ?? 3, 25),
      );
      env.state[`${node.id}:iter`] =
        ((env.state[`${node.id}:iter`] as number | undefined) ?? 0) + 1;
      const iter = env.state[`${node.id}:iter`] as number;
      const done = iter >= max || !evalCondition(node.condition, env);
      return {
        output: { iter, done },
        // next[0] = loop body, next[1] = exit
        nextId: done ? node.next?.[1] : node.next?.[0],
      };
    }
    default:
      throw new Error(`unsupported node kind: ${node.kind satisfies never}`);
  }
}

function nodeKindToStepKind(kind: NodeKind): TaskStep["kind"] {
  switch (kind) {
    case "llm":
      return "llm";
    case "tool":
      return "tool_call";
    case "agent":
      return "agent";
    case "condition":
    case "loop":
      return "decision";
    case "trigger":
    case "output":
    default:
      return "llm";
  }
}

/**
 * Evaluate a workflow node's condition string against the current env.
 * We intentionally don't shell out to `new Function()` to keep this
 * safe; instead we support a tiny set of DSL forms:
 *
 *   - "true" / "false"
 *   - "previous == <literal>"   (==, !=, includes)
 *   - "state.<key>"             (truthiness check)
 *
 * Anything else evaluates to `true` (fail-open so unfinished UI edits
 * don't brick a run).
 */
function evalCondition(expr: string | undefined, env: ExecEnv): boolean {
  if (!expr) return true;
  const trimmed = expr.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  const stateMatch = /^state\.([A-Za-z0-9_]+)$/.exec(trimmed);
  if (stateMatch) {
    const key = stateMatch[1]!;
    return Boolean(env.state[key]);
  }

  const cmp = /^(previous|input)\s*(==|!=|includes)\s*(.+)$/.exec(trimmed);
  if (cmp) {
    const [, lhsKey, op, rhsRaw] = cmp;
    const lhs = lhsKey === "previous" ? env.previous : env.input;
    const rhs = parseLiteral(rhsRaw!);
    switch (op) {
      case "==":
        return lhs === rhs;
      case "!=":
        return lhs !== rhs;
      case "includes":
        return (
          typeof lhs === "string" &&
          typeof rhs === "string" &&
          lhs.includes(rhs)
        );
    }
  }
  return true;
}

function parseLiteral(raw: string): unknown {
  const s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  const n = Number(s);
  if (!Number.isNaN(n)) return n;
  return s;
}

function toJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return null;
  }
}
