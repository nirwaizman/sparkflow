/**
 * Super Agent — top-level multi-agent orchestrator.
 *
 * Accepts a single freeform goal (e.g. "Prepare a pitch deck, generate 3
 * supporting landing-page images, and draft the investor email") and
 * decomposes it into typed sub-tasks, each of which is routed to a
 * specialist surface (slides, image, docs, dev, design, sheets, chat,
 * research).
 *
 * This module is intentionally transport-agnostic. `plan()` returns the
 * structured plan; `execute()` is an async generator that yields
 * `SuperEvent` frames describing progress. The HTTP route layer is
 * responsible for calling the real specialist endpoints (slides/generate,
 * docs/generate, image/generate, etc.) via an injected `runSubTask`
 * function — this keeps the agents package free of HTTP concerns and
 * unit-testable.
 */
import { z } from "zod";
import { generateObject } from "@sparkflow/llm";

/** The set of specialist surfaces Super Agent can route work to. */
export const SUB_TASK_KINDS = [
  "slides",
  "image",
  "docs",
  "dev",
  "design",
  "sheets",
  "chat",
  "research",
] as const;

export type SubTaskKind = (typeof SUB_TASK_KINDS)[number];

export type SubTask = {
  /** Stable id within a single plan (e.g. "t1", "t2"). */
  id: string;
  kind: SubTaskKind;
  /** Short human label shown in the UI timeline. */
  title: string;
  /** Free-form input payload passed to the specialist. Shape depends on `kind`. */
  input: unknown;
  /** Ids of other sub-tasks that must finish before this one starts. */
  dependsOn?: string[];
};

export type SuperEventType =
  | "plan"
  | "subtask_start"
  | "subtask_progress"
  | "subtask_done"
  | "subtask_error"
  | "finish";

export type SuperEvent =
  | { type: "plan"; payload: { goal: string; subTasks: SubTask[] } }
  | {
      type: "subtask_start";
      payload: { id: string; kind: SubTaskKind; title: string };
    }
  | {
      type: "subtask_progress";
      payload: { id: string; message: string };
    }
  | {
      type: "subtask_done";
      payload: {
        id: string;
        kind: SubTaskKind;
        title: string;
        output: unknown;
        /** URL the user can download / view the produced artifact from. */
        artifactUrl?: string;
        /** Short preview label, e.g. "deck.html", "image.png". */
        artifactLabel?: string;
      };
    }
  | {
      type: "subtask_error";
      payload: { id: string; kind: SubTaskKind; message: string };
    }
  | {
      type: "finish";
      payload: {
        ok: boolean;
        completed: string[];
        failed: string[];
      };
    };

/**
 * Result a `runSubTask` implementation returns. The HTTP route maps
 * specialist API responses into this shape.
 */
export type SubTaskResult = {
  output: unknown;
  artifactUrl?: string;
  artifactLabel?: string;
};

/**
 * Injectable runner — the HTTP route passes an implementation that calls
 * the internal specialist endpoints via `fetch` with the user's cookies.
 * Kept here as a dependency so the orchestrator stays pure.
 */
export type SubTaskRunner = (
  task: SubTask,
  emit: (message: string) => void,
) => Promise<SubTaskResult>;

const subTaskSchema = z.object({
  id: z.string().min(1).max(16),
  kind: z.enum(SUB_TASK_KINDS),
  title: z.string().min(1).max(200),
  input: z
    .record(z.unknown())
    .describe("Kind-specific payload. See guidance in the system prompt."),
  dependsOn: z.array(z.string()).optional(),
});

const planSchema = z.object({
  subTasks: z.array(subTaskSchema).min(1).max(8),
});

const PLANNER_SYSTEM = [
  "You are the Super Agent planner for SparkFlow — a productivity suite with these specialist surfaces:",
  "",
  "- slides  — generates a structured slide deck. input: { topic: string, audience?: string, tone?: string, numSlides?: number }",
  "- image   — generates images from a prompt. input: { prompt: string, n?: number, size?: '1024x1024'|'1024x1792'|'1792x1024' }",
  "- docs    — generates a long-form markdown document. input: { topic: string, targetLength?: 'short'|'medium'|'long' }",
  "- dev     — writes/edits code. input: { prompt: string }",
  "- design  — produces a design brief or visual layout. input: { prompt: string }",
  "- sheets  — generates a structured spreadsheet. input: { topic: string, rows?: number, columns?: string[] }",
  "- chat    — a general conversational reply. input: { prompt: string }",
  "- research — web research with Tavily. input: { query: string }",
  "",
  "Decompose the user goal into 2–8 independent or dependency-ordered sub-tasks.",
  "Rules:",
  "- Each sub-task id is short (t1, t2, …) and unique within the plan.",
  "- Use `dependsOn` ONLY when a later task genuinely needs an earlier task's output",
  "  (e.g. 'draft the investor email using the deck content'). Prefer independent tasks",
  "  so they can run in parallel.",
  "- Title is a concise human label (< 80 chars).",
  "- Pick the single best `kind` for each sub-task; do not invent kinds.",
  "- `input` must be an object; include only the fields listed for the chosen kind.",
].join("\n");

/**
 * Super Agent.
 *
 * Usage:
 *   const agent = new SuperAgent({ runSubTask });
 *   const plan = await agent.plan(goal);
 *   for await (const evt of agent.execute(plan)) { … }
 */
export class SuperAgent {
  private readonly runSubTask: SubTaskRunner;

  constructor(options: { runSubTask: SubTaskRunner }) {
    this.runSubTask = options.runSubTask;
  }

  /**
   * Decompose a freeform goal into a typed sub-task plan. No side effects.
   */
  async plan(goal: string): Promise<SubTask[]> {
    const { object } = await generateObject({
      schema: planSchema,
      system: PLANNER_SYSTEM,
      messages: [
        {
          id: cryptoRandomId(),
          role: "user",
          content: `GOAL:\n${goal}`,
        },
      ],
      temperature: 0.2,
    });

    // De-dup ids defensively — the model occasionally repeats.
    const seen = new Set<string>();
    const deduped: SubTask[] = [];
    for (const t of object.subTasks) {
      let id = t.id;
      let suffix = 1;
      while (seen.has(id)) id = `${t.id}_${suffix++}`;
      seen.add(id);
      deduped.push({
        id,
        kind: t.kind,
        title: t.title,
        input: t.input,
        dependsOn: (t.dependsOn ?? []).filter((d) => d !== t.id),
      });
    }
    return deduped;
  }

  /**
   * Execute sub-tasks, respecting `dependsOn` edges. Independent tasks
   * run in parallel. Errors on individual tasks do not abort the run;
   * dependents of a failed task are skipped and reported as errors.
   *
   * Emits a full `SuperEvent` trace. Callers are responsible for
   * serialising to the wire (SSE / WebSocket / etc.).
   */
  async *execute(subTasks: SubTask[]): AsyncGenerator<SuperEvent> {
    yield { type: "plan", payload: { goal: "", subTasks } };

    const byId = new Map(subTasks.map((t) => [t.id, t]));
    const status = new Map<string, "pending" | "running" | "done" | "error">();
    for (const t of subTasks) status.set(t.id, "pending");

    const completed: string[] = [];
    const failed: string[] = [];

    // Use a queue of events so parallel task runners can push into a
    // single ordered stream consumed by the generator.
    type Pending = Promise<void>;
    const inflight = new Map<string, Pending>();
    const queue: SuperEvent[] = [];
    let notify: (() => void) | null = null;
    const pushEvent = (evt: SuperEvent) => {
      queue.push(evt);
      if (notify) {
        const n = notify;
        notify = null;
        n();
      }
    };

    const depsSatisfied = (t: SubTask): boolean => {
      const deps = t.dependsOn ?? [];
      return deps.every((d) => status.get(d) === "done");
    };
    const depsFailed = (t: SubTask): boolean => {
      const deps = t.dependsOn ?? [];
      return deps.some((d) => {
        const s = status.get(d);
        return s === "error" || (s === undefined && !byId.has(d));
      });
    };

    const launch = (t: SubTask) => {
      status.set(t.id, "running");
      pushEvent({
        type: "subtask_start",
        payload: { id: t.id, kind: t.kind, title: t.title },
      });
      const promise = (async () => {
        try {
          const result = await this.runSubTask(t, (message) =>
            pushEvent({
              type: "subtask_progress",
              payload: { id: t.id, message },
            }),
          );
          status.set(t.id, "done");
          completed.push(t.id);
          pushEvent({
            type: "subtask_done",
            payload: {
              id: t.id,
              kind: t.kind,
              title: t.title,
              output: result.output,
              artifactUrl: result.artifactUrl,
              artifactLabel: result.artifactLabel,
            },
          });
        } catch (err) {
          status.set(t.id, "error");
          failed.push(t.id);
          pushEvent({
            type: "subtask_error",
            payload: {
              id: t.id,
              kind: t.kind,
              message: err instanceof Error ? err.message : String(err),
            },
          });
        } finally {
          inflight.delete(t.id);
          if (notify) {
            const n = notify;
            notify = null;
            n();
          }
        }
      })();
      inflight.set(t.id, promise);
    };

    // Main scheduler loop.
    while (true) {
      // 1. Launch everything whose deps are satisfied.
      for (const t of subTasks) {
        if (status.get(t.id) !== "pending") continue;
        if (depsFailed(t)) {
          status.set(t.id, "error");
          failed.push(t.id);
          pushEvent({
            type: "subtask_error",
            payload: {
              id: t.id,
              kind: t.kind,
              message: `skipped: dependency failed (${(t.dependsOn ?? []).join(", ")})`,
            },
          });
          continue;
        }
        if (depsSatisfied(t)) launch(t);
      }

      // 2. Drain any queued events.
      while (queue.length > 0) {
        yield queue.shift() as SuperEvent;
      }

      // 3. Exit when everything is resolved.
      const allDone = subTasks.every((t) => {
        const s = status.get(t.id);
        return s === "done" || s === "error";
      });
      if (allDone && inflight.size === 0) break;

      // 4. Wait for either another task to finish or a progress event.
      if (inflight.size > 0 || queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    }

    yield {
      type: "finish",
      payload: { ok: failed.length === 0, completed, failed },
    };
  }
}

function cryptoRandomId(): string {
  // Node 19+ and all modern runtimes expose globalThis.crypto.randomUUID.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
