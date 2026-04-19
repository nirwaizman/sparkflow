"use client";

/**
 * Browser automation client UI.
 *
 * - Goal textarea + optional Start URL input.
 * - "Run" posts to /api/browser/run and consumes the SSE response via
 *   `fetch` + a manual ReadableStream reader (we can't use EventSource
 *   because the endpoint requires POST with a JSON body).
 * - Timeline: each action is a card with status icon, description, and
 *   the screenshot that was captured after it ran. Final extracted
 *   results are rendered at the bottom.
 */
import { useCallback, useRef, useState } from "react";
import { Button, Input, Label, Textarea } from "@sparkflow/ui";

type ActionKind = "goto" | "type" | "click" | "wait" | "extract";

type PlanAction = {
  type: ActionKind;
  description?: string;
  url?: string;
  selector?: string;
  text?: string;
  instruction?: string;
  submit?: boolean;
  ms?: number;
};

type Plan = {
  summary: string;
  actions: PlanAction[];
};

type TimelineItem = {
  index: number;
  action: PlanAction;
  status: "pending" | "running" | "ok" | "error";
  error?: string;
  screenshot?: string;
  extracted?: unknown;
};

type Finish = { ok: boolean; error?: string; result?: unknown };

function actionLabel(a: PlanAction): string {
  if (a.description) return a.description;
  switch (a.type) {
    case "goto":
      return `Go to ${a.url ?? ""}`;
    case "type":
      return `Type "${a.text ?? ""}" into ${a.selector ?? ""}`;
    case "click":
      return `Click ${a.selector ?? ""}`;
    case "wait":
      return a.selector ? `Wait for ${a.selector}` : `Wait ${a.ms ?? 1000}ms`;
    case "extract":
      return `Extract: ${a.instruction ?? ""}`;
  }
}

function StatusDot({ status }: { status: TimelineItem["status"] }) {
  const color =
    status === "ok"
      ? "bg-emerald-500"
      : status === "error"
        ? "bg-red-500"
        : status === "running"
          ? "bg-amber-500 animate-pulse"
          : "bg-neutral-300";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

export function BrowserStudio() {
  const [goal, setGoal] = useState("");
  const [startUrl, setStartUrl] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [isRunning, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (!goal.trim() || isRunning) return;
    setRunning(true);
    setPlan(null);
    setItems([]);
    setFinish(null);
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/browser/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          startUrl: startUrl.trim() || undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Request failed: ${res.status} ${detail}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by blank lines.
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf("\n\n");
          handleFrame(frame);
        }
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") {
        // Caller cancelled — swallow.
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }

    function handleFrame(frame: string) {
      let eventName = "message";
      let dataStr = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
      }
      if (!dataStr) return;
      let payload: unknown;
      try {
        payload = JSON.parse(dataStr);
      } catch {
        return;
      }

      if (eventName === "plan") {
        const p = (payload as { plan: Plan }).plan;
        setPlan(p);
        setItems(
          p.actions.map((a, i) => ({ index: i, action: a, status: "pending" })),
        );
      } else if (eventName === "action_start") {
        const { index } = payload as { index: number };
        setItems((prev) =>
          prev.map((it) =>
            it.index === index ? { ...it, status: "running" } : it,
          ),
        );
      } else if (eventName === "action_end") {
        const { index, ok, error: aErr, extracted } = payload as {
          index: number;
          ok: boolean;
          error?: string;
          extracted?: unknown;
        };
        setItems((prev) =>
          prev.map((it) =>
            it.index === index
              ? {
                  ...it,
                  status: ok ? "ok" : "error",
                  error: aErr,
                  extracted,
                }
              : it,
          ),
        );
      } else if (eventName === "screenshot") {
        const { actionIndex, image } = payload as {
          actionIndex: number;
          image: string;
        };
        setItems((prev) =>
          prev.map((it) =>
            it.index === actionIndex ? { ...it, screenshot: image } : it,
          ),
        );
      } else if (eventName === "finish") {
        setFinish(payload as Finish);
      }
    }
  }, [goal, startUrl, isRunning]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="browser-goal">Goal</Label>
          <Textarea
            id="browser-goal"
            rows={3}
            placeholder='e.g. "Go to tripadvisor.com, search for hotels in Tel Aviv under $200/night, return top 5 with name, price and rating"'
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isRunning}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="browser-start-url">Start URL (optional)</Label>
          <Input
            id="browser-start-url"
            type="url"
            placeholder="https://…"
            value={startUrl}
            onChange={(e) => setStartUrl(e.target.value)}
            disabled={isRunning}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={run} disabled={!goal.trim() || isRunning}>
            {isRunning ? "Running…" : "Run"}
          </Button>
          {isRunning ? (
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          ) : null}
          {error ? (
            <span className="text-sm text-red-600">{error}</span>
          ) : null}
        </div>
      </section>

      {plan ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">Plan</h2>
          <p className="text-sm text-neutral-600">{plan.summary}</p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-700">Timeline</h2>
          <ol className="space-y-3">
            {items.map((it) => (
              <li
                key={it.index}
                className="rounded-md border border-neutral-200 p-3"
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={it.status} />
                  <span className="text-xs font-mono text-neutral-500">
                    {String(it.index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm">{actionLabel(it.action)}</span>
                </div>
                {it.error ? (
                  <p className="mt-1 text-xs text-red-600">{it.error}</p>
                ) : null}
                {it.screenshot ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.screenshot}
                    alt={`Screenshot after step ${it.index + 1}`}
                    className="mt-2 max-h-72 rounded border border-neutral-200"
                  />
                ) : null}
                {it.extracted ? (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-xs">
                    {JSON.stringify(it.extracted, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {finish ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-neutral-700">
            {finish.ok ? "Finished" : "Failed"}
          </h2>
          {finish.error ? (
            <p className="text-sm text-red-600">{finish.error}</p>
          ) : null}
          {finish.result !== undefined ? (
            <pre className="max-h-80 overflow-auto rounded bg-neutral-50 p-3 text-xs">
              {JSON.stringify(finish.result, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
