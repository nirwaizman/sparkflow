/**
 * POST /api/browser/run
 *
 * Flow:
 *  1. Auth gate (session required).
 *  2. Validate body `{ goal, startUrl? }`.
 *  3. Call `generateObject` with the `planSchema` to produce an
 *     `Action[]` plan from the user's natural-language goal.
 *  4. If `startUrl` was given and the plan doesn't already start with a
 *     matching `goto`, prepend one.
 *  5. Open an SSE stream. Run the plan via `runBrowserPlan` and forward
 *     each yielded event as a named SSE event.
 *
 * We mark the runtime as `nodejs` because Playwright is only supported
 * there, and we import the runner dynamically so the route module stays
 * light and edge-safe for any future metadata analysis.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { generateObject } from "@sparkflow/llm";
import { requireSession } from "@sparkflow/auth";
import { planSchema, type Action, type BrowserEvent } from "@/lib/browser/types";

export const runtime = "nodejs";
// SSE streams are inherently long-lived; force dynamic handling.
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  goal: z.string().min(1).max(4_000),
  startUrl: z.string().url().optional(),
});

function sseEvent(event: string, data: unknown): string {
  // Each SSE frame is `event:<name>\ndata:<json>\n\n`. We keep data on a
  // single line so clients don't need to assemble multi-line frames.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();

    const body = await request.json();
    const { goal, startUrl } = requestSchema.parse(body);

    // --- Plan -----------------------------------------------------------
    const system = [
      "You are a browser-automation planner.",
      "Given a user goal, output a short sequence of low-level actions a",
      "headless Chromium instance can execute.",
      "",
      "Rules:",
      "- Prefer CSS selectors. Role-based selectors are OK (e.g. 'role=button[name=\"Search\"]').",
      "- First action should usually be a `goto` to a plausible start URL.",
      "- Use `type` with submit:true for search bars instead of clicking a separate submit button when possible.",
      "- Finish with an `extract` action describing what data to return.",
      "- Keep the plan under 12 actions.",
      "- Do not attempt to log in, solve CAPTCHAs, or bypass paywalls.",
    ].join("\n");

    const user = [
      `Goal: ${goal}`,
      startUrl ? `Preferred start URL: ${startUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const planResult = await generateObject({
      schema: planSchema,
      system,
      messages: [{ id: crypto.randomUUID(), role: "user", content: user }],
      temperature: 0.2,
    });
    const plan = planResult.object;

    // If caller gave an explicit startUrl and the plan doesn't already
    // start there, inject a leading goto so we don't silently ignore it.
    let actions: Action[] = plan.actions;
    if (startUrl) {
      const first = actions[0];
      if (!first || first.type !== "goto" || first.url !== startUrl) {
        actions = [
          { type: "goto", url: startUrl, description: "Navigate to start URL" },
          ...actions,
        ];
      }
    }

    // --- Stream ---------------------------------------------------------
    const { runBrowserPlan } = await import("@/lib/browser/runner");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        };

        // Emit the plan first — the UI renders the timeline skeleton
        // before actions start.
        send("plan", { plan: { ...plan, actions } satisfies typeof plan });

        try {
          for await (const ev of runBrowserPlan(actions, {})) {
            const e = ev as BrowserEvent;
            send(e.kind, e);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          send("finish", { kind: "finish", ok: false, error: msg });
        } finally {
          controller.close();
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "invalid_request", issues: error.issues }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
