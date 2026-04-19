/**
 * POST /api/super/run
 *
 * Body: { goal: string, subTasks?: SubTask[] }
 * Response: text/event-stream of SuperEvent frames.
 *
 * If `subTasks` is omitted, we plan first via SuperAgent.plan. Otherwise
 * we execute the provided (potentially user-filtered) plan.
 *
 * Each sub-task calls the matching internal specialist API via `fetch`.
 * The user's cookies are forwarded so the specialist route's auth
 * middleware sees the same session. Failures are isolated — one failing
 * sub-task does NOT abort the run; dependent tasks are reported as
 * skipped errors and the final `finish` event carries the aggregate.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  SuperAgent,
  type SubTask,
  type SubTaskKind,
  type SubTaskResult,
  type SuperEvent,
  SUB_TASK_KINDS,
} from "@sparkflow/agents";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subTaskSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(SUB_TASK_KINDS),
  title: z.string().min(1),
  input: z.record(z.unknown()),
  dependsOn: z.array(z.string()).optional(),
});

const bodySchema = z.object({
  goal: z.string().min(1).max(4000),
  subTasks: z.array(subTaskSchema).optional(),
});

function sseEncode(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function getOrigin(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return request.nextUrl.origin;
}

/**
 * Map a sub-task kind to an internal API call. Each handler returns a
 * `SubTaskResult` describing the output and (when applicable) a URL the
 * user can download / view the produced artifact from.
 *
 * Handlers are intentionally tolerant — malformed input falls through
 * to a thrown error, which the orchestrator turns into a `subtask_error`
 * without aborting siblings.
 */
async function runViaApi(args: {
  task: SubTask;
  origin: string;
  cookie: string;
}): Promise<SubTaskResult> {
  const { task, origin, cookie } = args;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (cookie) headers["cookie"] = cookie;

  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `${path} failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${path} returned non-JSON: ${text.slice(0, 200)}`);
    }
  };

  const input = (task.input ?? {}) as Record<string, unknown>;

  switch (task.kind as SubTaskKind) {
    case "slides": {
      const body = {
        topic: String(input.topic ?? input.prompt ?? task.title),
        audience:
          typeof input.audience === "string" ? input.audience : undefined,
        tone: typeof input.tone === "string" ? input.tone : undefined,
        numSlides:
          typeof input.numSlides === "number" ? input.numSlides : undefined,
      };
      const res = await post<{ deck: unknown }>(
        "/api/slides/generate",
        body,
      );
      // Render to a downloadable reveal.js html.
      let artifactUrl: string | undefined;
      try {
        const renderRes = await fetch(`${origin}/api/slides/render`, {
          method: "POST",
          headers,
          body: JSON.stringify({ deck: res.deck }),
        });
        if (renderRes.ok) {
          const blob = await renderRes.blob();
          const buf = Buffer.from(await blob.arrayBuffer());
          artifactUrl = `data:text/html;base64,${buf.toString("base64")}`;
        }
      } catch {
        // Non-fatal — the raw deck JSON is still in `output`.
      }
      return {
        output: res.deck,
        artifactUrl,
        artifactLabel: "deck.html",
      };
    }

    case "image": {
      const body = {
        prompt: String(input.prompt ?? task.title),
        n: typeof input.n === "number" ? input.n : 1,
        size:
          typeof input.size === "string"
            ? (input.size as "1024x1024" | "1024x1792" | "1792x1024")
            : undefined,
      };
      const res = await post<{
        images: Array<{ url: string; storagePath: string | null }>;
      }>("/api/image/generate", body);
      const first = res.images?.[0];
      return {
        output: res.images,
        artifactUrl: first?.url,
        artifactLabel: "image.png",
      };
    }

    case "docs": {
      const body = {
        topic: String(input.topic ?? input.prompt ?? task.title),
        targetLength:
          typeof input.targetLength === "string"
            ? (input.targetLength as "short" | "medium" | "long")
            : "medium",
      };
      const res = await post<{ markdown: string }>(
        "/api/docs/generate",
        body,
      );
      // Expose the markdown as a data-URL so it's downloadable directly;
      // the `/api/docs/export` endpoint can be wired up later for .pdf.
      const md = res.markdown ?? "";
      const b64 = Buffer.from(md, "utf8").toString("base64");
      return {
        output: { markdown: md },
        artifactUrl: `data:text/markdown;base64,${b64}`,
        artifactLabel: "document.md",
      };
    }

    case "sheets": {
      const body = {
        topic: String(input.topic ?? input.prompt ?? task.title),
        rows: typeof input.rows === "number" ? input.rows : undefined,
        columns: Array.isArray(input.columns)
          ? (input.columns as string[])
          : undefined,
      };
      const res = await post<{ sheet: unknown }>(
        "/api/sheets/generate",
        body,
      );
      return {
        output: res.sheet,
        artifactLabel: "sheet.json",
      };
    }

    case "chat":
    case "research": {
      const prompt = String(input.prompt ?? input.query ?? task.title);
      // Use the non-streaming chat endpoint so the sub-task runner
      // returns once the assistant reply is complete.
      const res = await post<{ message?: { content?: string }; content?: string }>(
        "/api/chat",
        {
          messages: [
            { id: "u1", role: "user", content: prompt },
          ],
          forceSearch: task.kind === "research",
        },
      );
      const content =
        res.message?.content ?? res.content ?? JSON.stringify(res);
      return {
        output: { content },
        artifactLabel: task.kind === "research" ? "research.md" : "reply.md",
      };
    }

    case "dev":
    case "design": {
      // No dedicated endpoint yet — fall back to the chat endpoint with
      // a role hint in the prompt so the user still gets a useful
      // artifact while the surface-specific API is being built.
      const prompt = String(input.prompt ?? task.title);
      const rolePrefix =
        task.kind === "dev"
          ? "You are an expert software engineer. Produce concrete, runnable code."
          : "You are an expert product designer. Produce a crisp visual / UX brief.";
      const res = await post<{ message?: { content?: string }; content?: string }>(
        "/api/chat",
        {
          messages: [
            { id: "s1", role: "system", content: rolePrefix },
            { id: "u1", role: "user", content: prompt },
          ],
        },
      );
      const content =
        res.message?.content ?? res.content ?? JSON.stringify(res);
      return {
        output: { content },
        artifactLabel: task.kind === "dev" ? "code.md" : "brief.md",
      };
    }

    default: {
      const exhaustive: never = task.kind as never;
      throw new Error(`unsupported sub-task kind: ${exhaustive as string}`);
    }
  }
}

export async function POST(request: NextRequest) {
  const guestMode = request.headers.get("x-guest-mode") === "1";
  if (!guestMode) {
    try {
      await requireSession();
    } catch {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "invalid_body", issues: err.issues }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("invalid body", { status: 400 });
  }

  const origin = getOrigin(request);
  const cookie = request.headers.get("cookie") ?? "";

  const agent = new SuperAgent({
    runSubTask: async (task) => runViaApi({ task, origin, cookie }),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let aborted = false;
      const onAbort = () => {
        aborted = true;
      };
      request.signal.addEventListener("abort", onAbort);

      const safeEnqueue = (evt: SuperEvent) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(evt)));
        } catch {
          // Controller already closed.
        }
      };

      try {
        // Either use the caller-provided plan or ask SuperAgent to make one.
        let plan: SubTask[];
        if (parsed.subTasks && parsed.subTasks.length > 0) {
          plan = parsed.subTasks.map((t) => ({
            id: t.id,
            kind: t.kind,
            title: t.title,
            input: t.input,
            dependsOn: t.dependsOn,
          }));
          safeEnqueue({
            type: "plan",
            payload: { goal: parsed.goal, subTasks: plan },
          });
        } else {
          plan = await agent.plan(parsed.goal);
          safeEnqueue({
            type: "plan",
            payload: { goal: parsed.goal, subTasks: plan },
          });
        }

        for await (const evt of agent.execute(plan)) {
          if (aborted) break;
          // The generator itself also emits a `plan` event — skip the
          // second copy to avoid duplicates on the wire.
          if (evt.type === "plan") continue;
          safeEnqueue(evt);
        }
      } catch (err) {
        safeEnqueue({
          type: "finish",
          payload: {
            ok: false,
            completed: [],
            failed: [err instanceof Error ? err.message : String(err)],
          },
        });
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
