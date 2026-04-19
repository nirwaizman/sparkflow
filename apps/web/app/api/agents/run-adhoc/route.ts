/**
 * /api/agents/run-adhoc — SSE stream for a transient (non-persisted)
 * agent definition.
 *
 * The "Test run" button on /agents/new uses this to stream a prompt
 * through the draft-in-progress before the user saves the row. The
 * contract mirrors /api/agents/[id]/run:
 *
 *   Body: { prompt: string, definition: AgentDefinition-like, context?: AgentContext }
 *   Response: text/event-stream of AgentEvent frames.
 *
 * This endpoint does NOT persist anything. It does record a usage row
 * under `feature = "agent.run.adhoc"` for billing parity with the
 * regular run route.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, requireSession } from "@sparkflow/auth";
import {
  Agent,
  type AgentDefinition,
} from "@sparkflow/agents";
import { registerCoreTools, registry } from "@sparkflow/tools";
import { recordUsage } from "@sparkflow/billing/meter";

export const runtime = "nodejs";

registerCoreTools(registry);

const definitionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  objective: z.string().max(2000).optional(),
  systemPrompt: z.string().min(1),
  tools: z.array(z.string()).default([]),
  memoryScope: z
    .enum(["session", "user", "workspace", "global"])
    .default("session"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const bodySchema = z.object({
  prompt: z.string().min(1),
  definition: definitionSchema,
  context: z
    .object({
      conversationId: z.string().optional(),
      userId: z.string().optional(),
      organizationId: z.string().optional(),
      memories: z.record(z.string()).optional(),
      env: z.record(z.string()).optional(),
    })
    .optional(),
});

function sseEncode(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unauthorized", { status: 401 });
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

  // Reject tools that aren't in the shared registry so callers get a
  // fast, explicit error rather than a confusing runtime failure when
  // `toLlmTools` hits an unknown name.
  const unknownTools = parsed.definition.tools.filter((t) => !registry.has(t));
  if (unknownTools.length > 0) {
    return new Response(
      JSON.stringify({ error: "unknown_tools", invalid: unknownTools }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const def: AgentDefinition = {
    id: parsed.definition.id ?? "adhoc",
    name: parsed.definition.name,
    role: parsed.definition.role,
    objective: parsed.definition.objective ?? parsed.definition.role,
    systemPrompt: parsed.definition.systemPrompt,
    tools: parsed.definition.tools,
    memoryScope: parsed.definition.memoryScope,
    model: parsed.definition.model,
    temperature: parsed.definition.temperature,
  };

  const agent = new Agent(def, registry);
  const runStart = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Detect client abort so we can stop enqueueing and avoid a
      // "controller closed" throw crashing the route.
      let aborted = false;
      const onAbort = () => {
        aborted = true;
      };
      request.signal.addEventListener("abort", onAbort);
      try {
        for await (const evt of agent.stream({
          prompt: parsed.prompt,
          context: {
            ...parsed.context,
            userId: session.user.id,
            organizationId: session.organizationId,
          },
        })) {
          if (aborted) break;
          controller.enqueue(encoder.encode(sseEncode(evt)));
        }
        try {
          await recordUsage({
            organizationId: session.organizationId,
            userId: session.user.id,
            feature: "agent.run.adhoc",
            model: def.model,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            latencyMs: Date.now() - runStart,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[api/agents/run-adhoc] recordUsage failed", err);
        }
      } catch (err) {
        if (!aborted) {
          try {
            controller.enqueue(
              encoder.encode(
                sseEncode({
                  type: "error",
                  payload: {
                    message: err instanceof Error ? err.message : String(err),
                  },
                }),
              ),
            );
          } catch {
            // Controller already closed — nothing to do.
          }
        }
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
