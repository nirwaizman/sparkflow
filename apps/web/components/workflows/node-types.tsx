"use client";

/**
 * Custom react-flow node components for each of the 7 workflow node
 * kinds. Each node renders an icon, a title, a short summary of its
 * config, and a status dot used when a run is streaming.
 *
 * The node `data` shape intentionally mirrors @sparkflow/workflows'
 * `WorkflowNode` so serialising the graph back to the API contract is
 * a straight 1:1 mapping.
 */
import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  Zap,
  Sparkles,
  Wrench,
  Bot,
  GitBranch,
  Repeat,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { NodeKind } from "@sparkflow/workflows";

export type NodeStatus = "idle" | "running" | "ok" | "error";

export type WorkflowNodeData = {
  kind: NodeKind;
  label: string;
  config: Record<string, unknown>;
  status?: NodeStatus;
};

type Meta = {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  summary: (cfg: Record<string, unknown>) => string;
};

export const NODE_META: Record<NodeKind, Meta> = {
  trigger: {
    icon: Zap,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-300",
    summary: () => "Entry point",
  },
  llm: {
    icon: Sparkles,
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-300",
    summary: (c) =>
      typeof c.model === "string" && c.model ? String(c.model) : "LLM",
  },
  tool: {
    icon: Wrench,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    summary: (c) =>
      typeof c.tool === "string" && c.tool ? String(c.tool) : "Tool",
  },
  agent: {
    icon: Bot,
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-300",
    summary: (c) =>
      typeof c.agentId === "string" && c.agentId ? String(c.agentId) : "Agent",
  },
  condition: {
    icon: GitBranch,
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-300",
    summary: (c) =>
      typeof c.expression === "string" && c.expression
        ? String(c.expression)
        : "if …",
  },
  loop: {
    icon: Repeat,
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    summary: (c) => {
      const max =
        typeof c.maxIterations === "number" ? c.maxIterations : undefined;
      return max ? `≤ ${max} iters` : "loop";
    },
  },
  output: {
    icon: LogOut,
    color: "text-neutral-700",
    bg: "bg-neutral-50",
    border: "border-neutral-300",
    summary: (c) =>
      typeof c.field === "string" && c.field ? String(c.field) : "output",
  },
};

const STATUS_DOT: Record<NodeStatus, string> = {
  idle: "bg-neutral-300",
  running: "bg-amber-400 animate-pulse",
  ok: "bg-emerald-500",
  error: "bg-rose-500",
};

function BaseNode({ data, selected }: NodeProps<WorkflowNodeData>) {
  const d = data as WorkflowNodeData;
  const meta: Meta = NODE_META[d.kind] ?? NODE_META.output;
  const Icon = meta.icon;
  const status: NodeStatus = d.status ?? "idle";
  const isTrigger = d.kind === "trigger";
  const isOutput = d.kind === "output";

  return (
    <div
      className={[
        "min-w-[180px] rounded-md border px-3 py-2 shadow-sm",
        meta.bg,
        meta.border,
        selected ? "ring-2 ring-indigo-500 ring-offset-1" : "",
      ].join(" ")}
    >
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2 !w-2 !border !border-white !bg-neutral-400"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
        <span className="text-sm font-medium text-neutral-900">
          {d.label}
        </span>
        <span
          className={`ml-auto inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`}
          aria-label={`status: ${status}`}
        />
      </div>
      <p className="mt-1 truncate text-xs text-neutral-500">
        {meta.summary(d.config ?? {})}
      </p>
      {!isOutput ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border !border-white !bg-neutral-400"
        />
      ) : null}
    </div>
  );
}

const MemoNode = memo(BaseNode);

export const nodeTypes = {
  trigger: MemoNode,
  llm: MemoNode,
  tool: MemoNode,
  agent: MemoNode,
  condition: MemoNode,
  loop: MemoNode,
  output: MemoNode,
} as const;

export const NODE_KINDS: NodeKind[] = [
  "trigger",
  "llm",
  "tool",
  "agent",
  "condition",
  "loop",
  "output",
];

export const DEFAULT_LABELS: Record<NodeKind, string> = {
  trigger: "Trigger",
  llm: "LLM",
  tool: "Tool",
  agent: "Agent",
  condition: "Condition",
  loop: "Loop",
  output: "Output",
};

export function defaultConfigFor(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "trigger":
      return {};
    case "llm":
      return { model: "claude-3-5-sonnet", prompt: "", temperature: 0.7 };
    case "tool":
      return { tool: "" };
    case "agent":
      return { agentId: "" };
    case "condition":
      return { expression: "input != null" };
    case "loop":
      return { maxIterations: 5, collectionPath: "" };
    case "output":
      return { field: "result" };
  }
}
