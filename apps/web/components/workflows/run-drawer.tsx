"use client";

/**
 * Bottom drawer that shows the step timeline for the current run.
 *
 * The existing POST /api/workflows/[id]/run returns `{ status, events }`
 * once the run finishes (see apps/web/app/api/workflows/[id]/run/route.ts),
 * so this drawer renders the events batch once the promise resolves.
 * When the streaming SSE variant lands (WP-C5.1), plug a reader into
 * `onEvent` — the rendering here doesn't change.
 */
import { useEffect, useRef } from "react";
import type { TaskEvent } from "@sparkflow/workflows";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export type RunState = "idle" | "running" | "completed" | "failed";

type Props = {
  open: boolean;
  state: RunState;
  events: TaskEvent[];
  onClose: () => void;
};

export function RunDrawer({ open, state, events, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, open]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[45%] flex-col border-t bg-white shadow-lg"
      role="dialog"
      aria-label="Workflow run timeline"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <StatusBadge state={state} />
        <h3 className="text-sm font-semibold">Run timeline</h3>
        <span className="text-xs text-neutral-500">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
          aria-label="Close run drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs"
      >
        {events.length === 0 ? (
          <p className="py-4 text-center text-neutral-500">
            {state === "running" ? "Waiting for events…" : "No events."}
          </p>
        ) : (
          <ul className="space-y-1">
            {events.map((ev, i) => (
              <EventRow key={i} event={ev} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: RunState }) {
  switch (state) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
          <AlertCircle className="h-3 w-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
          Idle
        </span>
      );
  }
}

function EventRow({ event }: { event: TaskEvent }) {
  // TaskEvent is a discriminated union (see @sparkflow/tasks). We render
  // defensively so a new variant doesn't crash the UI.
  const ev = event as { type?: string; nodeId?: string; message?: string } & Record<
    string,
    unknown
  >;
  const type = ev.type ?? "event";
  const tone =
    type === "error"
      ? "text-rose-600"
      : type === "complete" || type === "end"
        ? "text-emerald-600"
        : "text-neutral-700";
  return (
    <li className="flex items-start gap-2">
      <span className={`w-20 shrink-0 font-semibold ${tone}`}>{type}</span>
      {ev.nodeId ? (
        <span className="w-32 shrink-0 truncate text-indigo-600">
          {ev.nodeId}
        </span>
      ) : null}
      <span className="flex-1 whitespace-pre-wrap break-all text-neutral-700">
        {ev.message ? String(ev.message) : summarise(event)}
      </span>
    </li>
  );
}

function summarise(ev: unknown): string {
  try {
    return JSON.stringify(ev);
  } catch {
    return String(ev);
  }
}
