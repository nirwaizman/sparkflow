/**
 * Shared types for the @sparkflow/workflows scaffolding (WP-C5).
 *
 * A workflow is a directed graph of typed nodes. Each run of a workflow
 * produces a `workflow_runs` row; the runtime walks the graph starting
 * from `entryNodeId`, emitting `TaskEvent`s so the same SSE pipe used
 * for tasks can stream workflow progress to the UI.
 */
import type { TaskEvent } from "@sparkflow/tasks";

export type NodeKind =
  | "trigger"
  | "llm"
  | "tool"
  | "agent"
  | "condition"
  | "loop"
  | "output";

export type WorkflowNode = {
  id: string;
  kind: NodeKind;
  config: Record<string, unknown>;
  /** Downstream node ids. For `condition` nodes, index 0 = true, 1 = false. */
  next?: string[];
  /**
   * For `condition` / `loop` nodes. A safe, sandboxed expression
   * evaluated against `{ input, previous, state }`. Kept as a string so
   * graphs are serialisable.
   */
  condition?: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  entryNodeId: string;
};

export type TriggerKind = "manual" | "webhook" | "cron";

export type WorkflowTrigger = {
  kind: TriggerKind;
  config?: unknown;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  graph: WorkflowGraph;
  trigger: WorkflowTrigger;
  version: number;
};

export type { TaskEvent };
