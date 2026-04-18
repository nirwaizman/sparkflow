"use client";

/**
 * QuickRun — modal-style drawer that streams AgentEvents from
 * `/api/agents/[id]/run` using the browser `fetch` + ReadableStream
 * APIs (the endpoint is SSE-shaped but we parse by hand so we stay
 * a normal `fetch` call and don't need the EventSource POST hack).
 */
import { useCallback, useRef, useState } from "react";

type AgentEvent =
  | { type: "start"; payload: { agentId: string; prompt: string } }
  | { type: "token"; payload: { delta: string } }
  | { type: "tool_start"; payload: { name: string; input: unknown } }
  | { type: "tool_end"; payload: { name: string; output: unknown; durationMs: number } }
  | { type: "thought"; payload: { text: string } }
  | { type: "finish"; payload: { content: string } }
  | { type: "error"; payload: { message: string } };

export function QuickRun({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const bufferRef = useRef("");

  const parseSse = useCallback(
    (chunk: string, onEvent: (evt: AgentEvent) => void) => {
      bufferRef.current += chunk;
      const parts = bufferRef.current.split("\n\n");
      bufferRef.current = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice("data:".length).trim();
        if (!payload) continue;
        try {
          onEvent(JSON.parse(payload) as AgentEvent);
        } catch {
          // Ignore malformed frames.
        }
      }
    },
    [],
  );

  const run = useCallback(async () => {
    if (!prompt.trim() || running) return;
    setEvents([]);
    bufferRef.current = "";
    setRunning(true);
    try {
      const res = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt }),
        },
      );
      if (!res.ok || !res.body) {
        setEvents((e) => [
          ...e,
          {
            type: "error",
            payload: { message: `HTTP ${res.status}` },
          },
        ]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parseSse(decoder.decode(value, { stream: true }), (evt) =>
          setEvents((prev) => [...prev, evt]),
        );
      }
    } catch (err) {
      setEvents((e) => [
        ...e,
        {
          type: "error",
          payload: { message: err instanceof Error ? err.message : String(err) },
        },
      ]);
    } finally {
      setRunning(false);
    }
  }, [agentId, parseSse, prompt, running]);

  const assembled = events
    .filter((e): e is Extract<AgentEvent, { type: "token" }> => e.type === "token")
    .map((e) => e.payload.delta)
    .join("");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-500"
      >
        Try
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Run: {agentName}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                Close
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={running}
              placeholder="What should this agent do?"
              className="mb-2 h-24 w-full resize-none rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
            />
            <button
              type="button"
              onClick={run}
              disabled={running || !prompt.trim()}
              className="mb-3 self-end rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {running ? "Running…" : "Run"}
            </button>
            <div className="flex-1 overflow-y-auto rounded-md border border-[hsl(var(--border))] p-3 text-sm">
              {assembled ? (
                <pre className="whitespace-pre-wrap break-words">{assembled}</pre>
              ) : (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Output will stream here.
                </p>
              )}
              {events
                .filter(
                  (e) =>
                    e.type === "tool_start" ||
                    e.type === "tool_end" ||
                    e.type === "error",
                )
                .map((e, i) => (
                  <div
                    key={i}
                    className={`mt-2 rounded px-2 py-1 text-xs ${
                      e.type === "error"
                        ? "bg-red-900/30 text-red-200"
                        : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {e.type === "error"
                      ? `Error: ${e.payload.message}`
                      : e.type === "tool_start"
                        ? `→ tool: ${e.payload.name}`
                        : `← tool: ${e.payload.name} (${e.payload.durationMs}ms)`}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
