"use client";

/**
 * SuperStudio client component.
 *
 * Flow:
 * 1. User types a goal, clicks "Plan".
 *    - POSTs /api/super/plan, renders the proposed sub-tasks as a
 *      checkbox list. User can uncheck sub-tasks they don't want.
 * 2. User clicks "Run".
 *    - POSTs /api/super/run with the (filtered) plan.
 *    - Reads the SSE stream, updating each sub-task row (queued →
 *      running → done/error) and collecting artifacts into the bottom
 *      panel.
 *
 * No external state management — local useState is enough for a single
 * active run.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Button,
  Textarea,
  Badge,
  Progress,
  Label,
} from "@sparkflow/ui";

type SubTaskKind =
  | "slides"
  | "image"
  | "docs"
  | "dev"
  | "design"
  | "sheets"
  | "chat"
  | "research";

type SubTask = {
  id: string;
  kind: SubTaskKind;
  title: string;
  input: Record<string, unknown>;
  dependsOn?: string[];
};

type SubTaskStatus = "queued" | "running" | "done" | "error";

type SubTaskRow = SubTask & {
  status: SubTaskStatus;
  progressMessages: string[];
  artifactUrl?: string;
  artifactLabel?: string;
  error?: string;
  output?: unknown;
};

type SuperEvent =
  | { type: "plan"; payload: { goal: string; subTasks: SubTask[] } }
  | {
      type: "subtask_start";
      payload: { id: string; kind: SubTaskKind; title: string };
    }
  | { type: "subtask_progress"; payload: { id: string; message: string } }
  | {
      type: "subtask_done";
      payload: {
        id: string;
        kind: SubTaskKind;
        title: string;
        output: unknown;
        artifactUrl?: string;
        artifactLabel?: string;
      };
    }
  | {
      type: "subtask_error";
      payload: { id: string; kind: SubTaskKind; message: string };
    }
  | {
      type: "finish";
      payload: { ok: boolean; completed: string[]; failed: string[] };
    };

const KIND_COLOR: Record<SubTaskKind, string> = {
  slides: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  image: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  docs: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  dev: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  design: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  sheets: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  chat: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
  research: "bg-sky-500/15 text-sky-400 border-sky-500/30",
};

const STATUS_LABEL: Record<SubTaskStatus, string> = {
  queued: "queued",
  running: "running…",
  done: "done",
  error: "error",
};

const STATUS_COLOR: Record<SubTaskStatus, string> = {
  queued: "bg-neutral-500/15 text-neutral-400",
  running: "bg-blue-500/15 text-blue-400",
  done: "bg-emerald-500/15 text-emerald-400",
  error: "bg-red-500/15 text-red-400",
};

function progressValue(row: SubTaskRow): number {
  if (row.status === "done") return 100;
  if (row.status === "error") return 100;
  if (row.status === "running") {
    // Grow with the number of progress messages, capped at 85%.
    return Math.min(85, 25 + row.progressMessages.length * 15);
  }
  return 5;
}

export function SuperStudio() {
  const [goal, setGoal] = useState("");
  const [isPlanning, setPlanning] = useState(false);
  const [isRunning, setRunning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [rows, setRows] = useState<SubTaskRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [finishSummary, setFinishSummary] = useState<
    { ok: boolean; completed: string[]; failed: string[] } | null
  >(null);

  const abortRef = useRef<AbortController | null>(null);

  const canPlan = goal.trim().length > 0 && !isPlanning && !isRunning;
  const canRun = rows.length > 0 && selected.size > 0 && !isRunning;

  const plan = useCallback(async () => {
    setPlanning(true);
    setPlanError(null);
    setRunError(null);
    setFinishSummary(null);
    setRows([]);
    setSelected(new Set());
    try {
      const res = await fetch("/api/super/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-guest-mode": "1",
        },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) {
        throw new Error(`Plan failed (${res.status}): ${await res.text()}`);
      }
      const json = (await res.json()) as { subTasks: SubTask[] };
      setRows(
        json.subTasks.map((t) => ({
          ...t,
          status: "queued" as const,
          progressMessages: [],
        })),
      );
      setSelected(new Set(json.subTasks.map((t) => t.id)));
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  }, [goal]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyEvent = useCallback((evt: SuperEvent) => {
    if (evt.type === "plan") {
      // Authoritative plan from the server — seed rows if we don't
      // already have a client-side plan.
      setRows((prev) => {
        if (prev.length > 0) return prev;
        return evt.payload.subTasks.map((t) => ({
          ...t,
          status: "queued" as const,
          progressMessages: [],
        }));
      });
      return;
    }
    if (evt.type === "subtask_start") {
      const { id } = evt.payload;
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "running" } : r)),
      );
      return;
    }
    if (evt.type === "subtask_progress") {
      const { id, message } = evt.payload;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, progressMessages: [...r.progressMessages, message] }
            : r,
        ),
      );
      return;
    }
    if (evt.type === "subtask_done") {
      const { id, output, artifactUrl, artifactLabel } = evt.payload;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "done",
                output,
                artifactUrl,
                artifactLabel,
              }
            : r,
        ),
      );
      return;
    }
    if (evt.type === "subtask_error") {
      const { id, message } = evt.payload;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: "error", error: message } : r,
        ),
      );
      return;
    }
    if (evt.type === "finish") {
      setFinishSummary(evt.payload);
      return;
    }
  }, []);

  const run = useCallback(async () => {
    if (rows.length === 0) return;
    setRunning(true);
    setRunError(null);
    setFinishSummary(null);

    // Reset statuses for any re-run while keeping the user's selection.
    setRows((prev) =>
      prev
        .filter((r) => selected.has(r.id))
        .map((r) => ({
          ...r,
          status: "queued",
          progressMessages: [],
          artifactUrl: undefined,
          artifactLabel: undefined,
          error: undefined,
          output: undefined,
        })),
    );

    const planned = rows
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        input: r.input,
        dependsOn: (r.dependsOn ?? []).filter((d) => selected.has(d)),
      }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/super/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-guest-mode": "1",
        },
        body: JSON.stringify({ goal, subTasks: planned }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Run failed (${res.status}): ${await res.text()}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Split on SSE boundaries ("\n\n").
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = line.slice("data: ".length).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as SuperEvent;
            applyEvent(evt);
          } catch {
            // Skip unparseable frames — server should never send them.
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRunError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }, [goal, rows, selected, applyEvent]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const artifacts = useMemo(
    () => rows.filter((r) => r.status === "done" && r.artifactUrl),
    [rows],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
        <Label htmlFor="super-goal" className="text-sm font-medium">
          Goal
        </Label>
        <Textarea
          id="super-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Prepare a pitch deck about our AI legal product, generate 3 supporting landing-page images, and draft the investor email."
          rows={4}
          className="mt-2"
          disabled={isPlanning || isRunning}
        />
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={plan} disabled={!canPlan}>
            {isPlanning ? "Planning…" : "Plan"}
          </Button>
          <Button
            onClick={run}
            disabled={!canRun}
            variant="default"
          >
            {isRunning ? "Running…" : "Run"}
          </Button>
          {isRunning ? (
            <Button onClick={cancel} variant="secondary">
              Cancel
            </Button>
          ) : null}
          {planError ? (
            <span className="text-sm text-red-400">{planError}</span>
          ) : null}
          {runError ? (
            <span className="text-sm text-red-400">{runError}</span>
          ) : null}
        </div>
      </section>

      {rows.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-300">
            Plan ({rows.length} sub-tasks, {selected.size} selected)
          </h2>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    disabled={isRunning}
                    className="h-4 w-4 accent-indigo-500"
                    aria-label={`Include ${row.title}`}
                  />
                  <Badge
                    className={`border ${KIND_COLOR[row.kind]} uppercase`}
                    variant="outline"
                  >
                    {row.kind}
                  </Badge>
                  <span className="text-sm font-medium text-neutral-100">
                    {row.title}
                  </span>
                  <span className="text-xs text-neutral-500">#{row.id}</span>
                  {row.dependsOn && row.dependsOn.length > 0 ? (
                    <span className="text-xs text-neutral-500">
                      depends on {row.dependsOn.join(", ")}
                    </span>
                  ) : null}
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[row.status]}`}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                </div>

                {(row.status === "running" || row.status === "done") ? (
                  <div className="mt-2">
                    <Progress value={progressValue(row)} />
                  </div>
                ) : null}

                {row.progressMessages.length > 0 ? (
                  <div className="mt-2 text-xs text-neutral-500">
                    {row.progressMessages[row.progressMessages.length - 1]}
                  </div>
                ) : null}

                {row.error ? (
                  <div className="mt-2 text-xs text-red-400">
                    {row.error}
                  </div>
                ) : null}

                {row.status === "done" && row.artifactUrl ? (
                  <div className="mt-2">
                    <a
                      href={row.artifactUrl}
                      download={row.artifactLabel ?? "artifact"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/20"
                    >
                      Download {row.artifactLabel ?? "artifact"}
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {artifacts.length > 0 ? (
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-neutral-300">
            Artifacts ({artifacts.length})
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {artifacts.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    className={`border ${KIND_COLOR[row.kind]} uppercase`}
                    variant="outline"
                  >
                    {row.kind}
                  </Badge>
                  <span className="truncate text-sm text-neutral-200">
                    {row.title}
                  </span>
                </div>
                <a
                  href={row.artifactUrl}
                  download={row.artifactLabel ?? "artifact"}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/20"
                >
                  {row.artifactLabel ?? "download"}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {finishSummary ? (
        <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 text-sm">
          <span
            className={
              finishSummary.ok
                ? "text-emerald-400"
                : finishSummary.completed.length > 0
                  ? "text-amber-400"
                  : "text-red-400"
            }
          >
            {finishSummary.ok ? "All sub-tasks completed." : "Run finished with errors."}
          </span>{" "}
          <span className="text-neutral-400">
            {finishSummary.completed.length} completed
            {finishSummary.failed.length > 0
              ? `, ${finishSummary.failed.length} failed`
              : ""}
            .
          </span>
        </section>
      ) : null}
    </div>
  );
}
