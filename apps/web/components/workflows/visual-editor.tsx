"use client";

/**
 * Visual workflow editor — a react-flow canvas wired up to the same
 * `{ name, graph, trigger }` API contract that the previous JSON
 * textarea posted to /api/workflows.
 *
 * State ownership:
 * - `nodes`/`edges` live in react-flow state here.
 * - The palette (left) emits nodes via HTML drag-and-drop.
 * - The config panel (right) edits the selected node's `data.config`.
 * - The run drawer (bottom) shows events from POST /api/workflows/[id]/run.
 *
 * The graph → API translation happens in `serializeGraph()` below;
 * round-tripping is lossy for layout (positions are dropped) because
 * the API schema doesn't carry them — if the caller preloads a
 * workflow we lay it out with a simple left-to-right heuristic.
 */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import type {
  NodeKind,
  TriggerKind,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowTrigger,
  TaskEvent,
} from "@sparkflow/workflows";
import { Play, Save, Download, Upload, MoreHorizontal } from "lucide-react";

import { NodePalette, DRAG_MIME } from "./node-palette";
import { NodeConfigPanel } from "./node-config-panel";
import { RunDrawer, type RunState } from "./run-drawer";
import {
  DEFAULT_LABELS,
  defaultConfigFor,
  nodeTypes,
  type WorkflowNodeData,
} from "./node-types";

export type VisualEditorProps = {
  /** Existing workflow to preload (detail page). Omit for "new". */
  initial?: WorkflowDefinition | null;
  /** Known tool names for the tool-node picker. */
  toolNames?: string[];
  /** Known agent ids for the agent-node picker. */
  agentIds?: string[];
  /** When set, Save will PATCH to /api/workflows/{id} — future; for now POST always. */
  workflowId?: string | null;
};

type FlowNode = Node<WorkflowNodeData>;

let _idSeq = 0;
function newNodeId(kind: NodeKind): string {
  _idSeq += 1;
  return `${kind}_${Date.now().toString(36)}_${_idSeq}`;
}

function triggerNodeFromDef(t: WorkflowTrigger | null): WorkflowTrigger {
  return t ?? { kind: "manual" };
}

/**
 * Naive left-to-right layout for preloaded graphs: BFS from the entry
 * node, assigning columns by depth and rows by encounter order. Good
 * enough until we persist `position` per node.
 */
function layout(
  graph: WorkflowGraph,
): { positions: Record<string, { x: number; y: number }>; edges: Edge[] } {
  const positions: Record<string, { x: number; y: number }> = {};
  const depth: Record<string, number> = {};
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const queue: string[] = [graph.entryNodeId];
  depth[graph.entryNodeId] = 0;
  const seen = new Set<string>([graph.entryNodeId]);
  while (queue.length) {
    const id = queue.shift()!;
    const n = byId.get(id);
    if (!n) continue;
    for (const next of n.next ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        depth[next] = (depth[id] ?? 0) + 1;
        queue.push(next);
      }
    }
  }
  const rowCursor: Record<number, number> = {};
  for (const n of graph.nodes) {
    const d = depth[n.id] ?? 0;
    const r = (rowCursor[d] = (rowCursor[d] ?? 0) + 1) - 1;
    positions[n.id] = { x: d * 260, y: r * 120 };
  }
  const edges: Edge[] = [];
  for (const n of graph.nodes) {
    for (const next of n.next ?? []) {
      edges.push({
        id: `e_${n.id}_${next}`,
        source: n.id,
        target: next,
      });
    }
  }
  return { positions, edges };
}

function toFlow(
  def: WorkflowDefinition,
): { nodes: FlowNode[]; edges: Edge[] } {
  const { positions, edges } = layout(def.graph);
  const nodes: FlowNode[] = def.graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: positions[n.id] ?? { x: 0, y: 0 },
    data: {
      kind: n.kind,
      label: DEFAULT_LABELS[n.kind],
      config: n.config ?? {},
    },
  }));
  return { nodes, edges };
}

function serializeGraph(
  nodes: FlowNode[],
  edges: Edge[],
): { graph: WorkflowGraph | null; error: string | null } {
  if (nodes.length === 0) {
    return { graph: null, error: "Add at least one node." };
  }
  const triggers = nodes.filter((n) => n.data.kind === "trigger");
  if (triggers.length === 0) {
    return { graph: null, error: "Graph needs a trigger node." };
  }
  if (triggers.length > 1) {
    return { graph: null, error: "Only one trigger node is allowed." };
  }
  const adjacency: Record<string, string[]> = {};
  for (const e of edges) {
    (adjacency[e.source] ??= []).push(e.target);
  }
  const entryTrigger = triggers[0];
  if (!entryTrigger) {
    throw new Error("No trigger node to serialize");
  }
  return {
    graph: {
      entryNodeId: entryTrigger.id,
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: n.data.kind,
        config: n.data.config ?? {},
        next: adjacency[n.id] ?? [],
      })),
    },
    error: null,
  };
}

function Inner({
  initial,
  toolNames,
  agentIds,
  workflowId,
}: VisualEditorProps) {
  const router = useRouter();
  const rfWrapper = useRef<HTMLDivElement | null>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const { project } = useReactFlow();

  const bootstrap = useMemo(() => {
    if (initial) return toFlow(initial);
    const triggerId = newNodeId("trigger");
    return {
      nodes: [
        {
          id: triggerId,
          type: "trigger",
          position: { x: 0, y: 80 },
          data: {
            kind: "trigger" as NodeKind,
            label: DEFAULT_LABELS.trigger,
            config: {},
          },
        } satisfies FlowNode,
      ],
      edges: [] as Edge[],
    };
  }, [initial]);

  const [nodes, setNodes] = useState<FlowNode[]>(bootstrap.nodes);
  const [edges, setEdges] = useState<Edge[]>(bootstrap.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState<string>(initial?.name ?? "Untitled workflow");
  const [trigger, setTrigger] = useState<WorkflowTrigger>(
    triggerNodeFromDef(initial?.trigger ?? null),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [runState, setRunState] = useState<RunState>("idle");
  const [runEvents, setRunEvents] = useState<TaskEvent[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((n) => applyNodeChanges(changes, n)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((e) => applyEdgeChanges(changes, e)),
    [],
  );
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((e) =>
        addEdge({ ...c, id: `e_${c.source}_${c.target}_${Date.now()}` }, e),
      ),
    [],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const kind = (e.dataTransfer.getData(DRAG_MIME) ||
        e.dataTransfer.getData("text/plain")) as NodeKind | "";
      if (!kind) return;
      const bounds = rfWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const position = project({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });
      const id = newNodeId(kind);
      const node: FlowNode = {
        id,
        type: kind,
        position,
        data: {
          kind,
          label: DEFAULT_LABELS[kind],
          config: defaultConfigFor(kind),
        },
      };
      setNodes((n) => n.concat(node));
    },
    [project],
  );

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const patchNode = useCallback(
    (id: string, patch: Partial<WorkflowNodeData>) => {
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [],
  );

  const deleteNode = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
  }, []);

  async function handleSave() {
    setError(null);
    const { graph, error } = serializeGraph(nodes, edges);
    if (!graph) {
      setError(error ?? "Invalid graph.");
      return;
    }
    if (!name.trim()) {
      setError("Workflow needs a name.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), graph, trigger }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRun() {
    if (!workflowId) {
      setError("Save the workflow before running it.");
      return;
    }
    setRunState("running");
    setRunEvents([]);
    setDrawerOpen(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: "completed" | "failed";
        events?: TaskEvent[];
        error?: string;
      };
      if (!res.ok) {
        setRunState("failed");
        setRunEvents(
          (data.events ?? []).concat(
            data.error
              ? ([
                  { type: "error", message: data.error },
                ] as unknown as TaskEvent[])
              : [],
          ),
        );
        return;
      }
      setRunEvents(data.events ?? []);
      setRunState(data.status === "failed" ? "failed" : "completed");
    } catch (err) {
      setRunEvents([
        {
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        } as unknown as TaskEvent,
      ]);
      setRunState("failed");
    }
  }

  function handleExport() {
    const { graph } = serializeGraph(nodes, edges);
    const blob = new Blob(
      [
        JSON.stringify(
          { name, trigger, graph: graph ?? { entryNodeId: "", nodes: [] } },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/\s+/g, "-").toLowerCase() || "workflow"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Partial<WorkflowDefinition>;
        if (
          !parsed.graph ||
          !Array.isArray(parsed.graph.nodes) ||
          !parsed.graph.entryNodeId
        ) {
          setError("Imported file is missing a valid graph.");
          return;
        }
        const flow = toFlow({
          id: "",
          name: parsed.name ?? "Imported workflow",
          version: 1,
          trigger: parsed.trigger ?? { kind: "manual" },
          graph: parsed.graph,
        } as WorkflowDefinition);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        if (parsed.name) setName(parsed.name);
        if (parsed.trigger) setTrigger(parsed.trigger);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to import file.",
        );
      }
    };
    input.click();
    setMenuOpen(false);
  }

  return (
    <div className="relative flex h-[calc(100vh-8rem)] min-h-[560px] w-full overflow-hidden rounded-lg border bg-neutral-50">
      <NodePalette />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b bg-white px-3 py-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm font-medium"
            aria-label="Workflow name"
          />
          <select
            value={trigger.kind}
            onChange={(e) =>
              setTrigger({ kind: e.target.value as TriggerKind })
            }
            className="rounded-md border px-2 py-1 text-sm"
            aria-label="Trigger kind"
          >
            <option value="manual">manual</option>
            <option value="webhook">webhook</option>
            <option value="cron">cron</option>
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={!workflowId || runState === "running"}
            title={
              workflowId ? "Run this workflow" : "Save the workflow first"
            }
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
              className="rounded-md border p-1.5 hover:bg-neutral-50"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-md border bg-white shadow-md">
                <button
                  type="button"
                  onClick={handleImport}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import JSON
                </button>
                <button
                  type="button"
                  onClick={handleExport}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="border-b bg-rose-50 px-3 py-1.5 text-xs text-rose-700" role="alert">
            {error}
          </div>
        ) : null}
        <div
          className="relative flex-1"
          ref={rfWrapper}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRf}
            onNodeClick={(_evt: unknown, n: FlowNode) =>
              setSelectedId(n.id)
            }
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bg-white" />
          </ReactFlow>
          <RunDrawer
            open={drawerOpen}
            state={runState}
            events={runEvents}
            onClose={() => setDrawerOpen(false)}
          />
        </div>
      </div>
      <NodeConfigPanel
        node={selected}
        toolNames={toolNames}
        agentIds={agentIds}
        onChange={patchNode}
        onDelete={deleteNode}
      />
      {/* `rf` is wired for future viewport APIs (centerOn, flyTo). */}
      <span data-rf-ready={rf ? "true" : "false"} className="hidden" />
    </div>
  );
}

/**
 * Public wrapper — react-flow requires a provider in the tree for
 * `useReactFlow()` hooks to work when rendering outside `<ReactFlow />`.
 */
export function VisualEditor(props: VisualEditorProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

export default VisualEditor;
