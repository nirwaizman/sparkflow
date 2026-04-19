"use client";

/**
 * Right-hand sidebar that edits the currently selected node's config.
 *
 * Each node kind has a bespoke form; the shape of `config` written
 * back matches what the workflow runtime expects so that serialisation
 * is a direct pass-through.
 */
import type { ChangeEvent } from "react";
import type { Node } from "reactflow";
import type { NodeKind } from "@sparkflow/workflows";
import type { WorkflowNodeData } from "./node-types";
import { DEFAULT_LABELS, NODE_META } from "./node-types";

type Props = {
  node: Node<WorkflowNodeData> | null;
  /** Known tool registry names (for the tool picker). */
  toolNames?: string[];
  /** Known agent ids (for the agent picker). */
  agentIds?: string[];
  onChange: (
    nodeId: string,
    patch: Partial<WorkflowNodeData>,
  ) => void;
  onDelete: (nodeId: string) => void;
};

const LLM_MODELS = [
  "claude-3-5-sonnet",
  "claude-3-5-haiku",
  "claude-3-opus",
  "gpt-4o",
  "gpt-4o-mini",
];

export function NodeConfigPanel({
  node,
  toolNames = [],
  agentIds = [],
  onChange,
  onDelete,
}: Props) {
  if (!node) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l bg-white">
        <div className="border-b px-3 py-2">
          <h2 className="text-sm font-semibold">Configuration</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-neutral-500">
          Select a node to edit its configuration.
        </div>
      </aside>
    );
  }

  const data = node.data as WorkflowNodeData;
  const cfg = data.config ?? {};
  const meta = NODE_META[data.kind] ?? NODE_META.output;
  const Icon = meta.icon;
  const kindLabel = DEFAULT_LABELS[data.kind] ?? data.kind;

  function setConfig(patch: Record<string, unknown>) {
    onChange(node!.id, { config: { ...cfg, ...patch } });
  }
  function setLabel(e: ChangeEvent<HTMLInputElement>) {
    onChange(node!.id, { label: e.target.value });
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l bg-white">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
        <h2 className="text-sm font-semibold">{kindLabel} node</h2>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="ml-auto rounded-md border border-rose-200 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
        >
          Delete
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <Field label="Label">
          <input
            type="text"
            value={data.label}
            onChange={setLabel}
            className="w-full rounded-md border px-2 py-1 text-sm"
          />
        </Field>
        <Field label="Node id">
          <code className="block rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
            {node.id}
          </code>
        </Field>

        <KindForm
          kind={data.kind}
          config={cfg}
          toolNames={toolNames}
          agentIds={agentIds}
          setConfig={setConfig}
        />
      </div>
    </aside>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-700">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-neutral-500">{hint}</span>
      ) : null}
    </label>
  );
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function KindForm({
  kind,
  config,
  toolNames,
  agentIds,
  setConfig,
}: {
  kind: NodeKind;
  config: Record<string, unknown>;
  toolNames: string[];
  agentIds: string[];
  setConfig: (patch: Record<string, unknown>) => void;
}) {
  switch (kind) {
    case "trigger":
      return (
        <p className="text-xs text-neutral-500">
          Trigger nodes are the workflow entry point. Configure the trigger
          kind (manual / webhook / cron) at the workflow level.
        </p>
      );

    case "llm":
      return (
        <>
          <Field label="Model">
            <select
              value={str(config.model, LLM_MODELS[0])}
              onChange={(e) => setConfig({ model: e.target.value })}
              className="w-full rounded-md border px-2 py-1 text-sm"
            >
              {LLM_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prompt">
            <textarea
              value={str(config.prompt)}
              onChange={(e) => setConfig({ prompt: e.target.value })}
              rows={6}
              className="w-full rounded-md border px-2 py-1 font-mono text-xs"
              placeholder="You are a helpful assistant…"
            />
          </Field>
          <Field
            label={`Temperature: ${num(config.temperature, 0.7).toFixed(2)}`}
          >
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={num(config.temperature, 0.7)}
              onChange={(e) =>
                setConfig({ temperature: Number(e.target.value) })
              }
              className="w-full"
            />
          </Field>
        </>
      );

    case "tool":
      return (
        <Field
          label="Tool"
          hint="Name from the @sparkflow/tools registry."
        >
          {toolNames.length > 0 ? (
            <select
              value={str(config.tool)}
              onChange={(e) => setConfig({ tool: e.target.value })}
              className="w-full rounded-md border px-2 py-1 text-sm"
            >
              <option value="">— choose a tool —</option>
              {toolNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={str(config.tool)}
              onChange={(e) => setConfig({ tool: e.target.value })}
              placeholder="search-web"
              className="w-full rounded-md border px-2 py-1 font-mono text-xs"
            />
          )}
        </Field>
      );

    case "agent":
      return (
        <Field label="Agent" hint="Id of a @sparkflow/agents builtin or saved agent.">
          {agentIds.length > 0 ? (
            <select
              value={str(config.agentId)}
              onChange={(e) => setConfig({ agentId: e.target.value })}
              className="w-full rounded-md border px-2 py-1 text-sm"
            >
              <option value="">— choose an agent —</option>
              {agentIds.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={str(config.agentId)}
              onChange={(e) => setConfig({ agentId: e.target.value })}
              placeholder="writer"
              className="w-full rounded-md border px-2 py-1 font-mono text-xs"
            />
          )}
        </Field>
      );

    case "condition":
      return (
        <Field
          label="Expression"
          hint="Sandboxed boolean expression over { input, previous, state }."
        >
          <input
            type="text"
            value={str(config.expression)}
            onChange={(e) => setConfig({ expression: e.target.value })}
            placeholder="input.score > 0.5"
            className="w-full rounded-md border px-2 py-1 font-mono text-xs"
          />
        </Field>
      );

    case "loop":
      return (
        <>
          <Field label="Max iterations">
            <input
              type="number"
              min={1}
              max={1000}
              value={num(config.maxIterations, 5)}
              onChange={(e) =>
                setConfig({ maxIterations: Number(e.target.value) })
              }
              className="w-full rounded-md border px-2 py-1 text-sm"
            />
          </Field>
          <Field
            label="Collection path"
            hint="Dotted path to the array to iterate (e.g. input.items)."
          >
            <input
              type="text"
              value={str(config.collectionPath)}
              onChange={(e) => setConfig({ collectionPath: e.target.value })}
              placeholder="input.items"
              className="w-full rounded-md border px-2 py-1 font-mono text-xs"
            />
          </Field>
        </>
      );

    case "output":
      return (
        <Field label="Field name" hint="Key the final value is written to.">
          <input
            type="text"
            value={str(config.field, "result")}
            onChange={(e) => setConfig({ field: e.target.value })}
            className="w-full rounded-md border px-2 py-1 font-mono text-xs"
          />
        </Field>
      );
  }
}
