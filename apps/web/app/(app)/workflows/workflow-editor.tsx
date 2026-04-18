"use client";

/**
 * Client-side JSON editor placeholder for workflow definitions.
 *
 * Validates the shape locally before POSTing to /api/workflows so the
 * user gets immediate feedback. The full visual editor is deferred to
 * WP-C5.1; the JSON shape stays the canonical representation so that
 * upgrade path is additive.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TEMPLATE = JSON.stringify(
  {
    name: "Untitled workflow",
    description: "",
    trigger: { kind: "manual" },
    graph: {
      entryNodeId: "n1",
      nodes: [
        { id: "n1", kind: "trigger", config: {}, next: ["n2"] },
        {
          id: "n2",
          kind: "llm",
          config: { prompt: "Summarise the input." },
          next: ["n3"],
        },
        { id: "n3", kind: "output", config: {} },
      ],
    },
  },
  null,
  2,
);

type Parsed = {
  name: string;
  description?: string;
  trigger: { kind: string };
  graph: { entryNodeId: string; nodes: Array<{ id: string; kind: string }> };
};

function localValidate(raw: string): { ok: true; body: Parsed } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Expected an object at the top level." };
  }
  const p = parsed as Partial<Parsed>;
  if (!p.name || typeof p.name !== "string") {
    return { ok: false, error: "Missing `name` (string)." };
  }
  if (!p.trigger || typeof p.trigger !== "object" || typeof p.trigger.kind !== "string") {
    return { ok: false, error: "Missing or invalid `trigger.kind`." };
  }
  if (!p.graph || !Array.isArray(p.graph.nodes) || p.graph.nodes.length === 0) {
    return { ok: false, error: "`graph.nodes` must be a non-empty array." };
  }
  if (typeof p.graph.entryNodeId !== "string" || p.graph.entryNodeId.length === 0) {
    return { ok: false, error: "Missing `graph.entryNodeId`." };
  }
  const ids = new Set(p.graph.nodes.map((n) => n.id));
  if (!ids.has(p.graph.entryNodeId)) {
    return { ok: false, error: `entryNodeId "${p.graph.entryNodeId}" is not in nodes.` };
  }
  return { ok: true, body: p as Parsed };
}

export function WorkflowEditor() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    const v = localValidate(text);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/workflows", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(v.body),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
      >
        New workflow
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor="wf-json" className="block text-sm font-medium">
        Workflow JSON
      </label>
      <textarea
        id="wf-json"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={18}
        spellCheck={false}
        className="w-full rounded-md border px-3 py-2 font-mono text-xs focus:outline-none focus:ring"
        disabled={isPending}
      />
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save workflow"}
        </button>
      </div>
    </div>
  );
}
