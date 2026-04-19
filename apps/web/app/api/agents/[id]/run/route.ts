/**
 * /api/agents/[id]/run — SSE stream of AgentEvents for a single run.
 *
 * Body: { prompt: string, context?: AgentContext }
 *
 * The handler:
 *   1. Resolves the agent (built-in by id, else a custom DB row latest
 *      version).
 *   2. Instantiates an `Agent` with the shared tool registry.
 *   3. Pumps `agent.stream()` out as text/event-stream.
 *   4. Records a single `usage_records` row on finish via
 *      `@sparkflow/billing`'s `recordUsage`. The minimal LLM gateway
 *      used by `Agent.stream()` does not emit a usage object today —
 *      until WP-B2 lands the full streaming loop we log a TODO and
 *      persist a zero-cost record so ops tooling still counts the run.
 */
import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, agents as agentsTable } from "@sparkflow/db";
import { AuthError, requireSession } from "@sparkflow/auth";
import {
  Agent,
  analystAgent,
  coderAgent,
  criticAgent,
  fileAgent,
  monetizationAgent,
  plannerAgent,
  researchAgent,
  securityAgent,
  taskExecutorAgent,
  uxAgent,
  writerAgent,
  type AgentDefinition,
} from "@sparkflow/agents";
import { registerCoreTools, registry } from "@sparkflow/tools";
// Use the subpath export to avoid pulling the Stripe SDK transitively
// into this route's dependency graph.
import { recordUsage } from "@sparkflow/billing/meter";

export const runtime = "nodejs";

registerCoreTools(registry);

const BUILT_INS: Record<string, AgentDefinition> = {
  research: researchAgent,
  analyst: analystAgent,
  writer: writerAgent,
  coder: coderAgent,
  file: fileAgent,
  "task-executor": taskExecutorAgent,
  critic: criticAgent,
  planner: plannerAgent,
  monetization: monetizationAgent,
  ux: uxAgent,
  security: securityAgent,
};

const runSchema = z.object({
  prompt: z.string().min(1),
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveDefinition(
  id: string,
  organizationId: string,
): Promise<AgentDefinition | null> {
  if (id.startsWith("builtin:")) {
    const key = id.slice("builtin:".length);
    return BUILT_INS[key] ?? null;
  }
  // Allow bare built-in names (e.g. `research`) for convenience.
  if (Object.prototype.hasOwnProperty.call(BUILT_INS, id)) {
    return BUILT_INS[id] ?? null;
  }
  // Custom agents are stored by UUID; short-circuit non-UUIDs so a
  // typo doesn't cascade into a Postgres "invalid uuid" 500.
  if (!UUID_RE.test(id)) {
    return null;
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.id, id))
    .orderBy(desc(agentsTable.version))
    .limit(1);
  if (!row) return null;
  if (row.organizationId && row.organizationId !== organizationId) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    objective: row.description ?? row.role,
    systemPrompt: row.systemPrompt,
    tools: Array.isArray(row.tools) ? (row.tools as string[]) : [],
    memoryScope: row.memoryScope,
    model: row.model ?? undefined,
  };
}

function sseEncode(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  let parsed: z.infer<typeof runSchema>;
  try {
    parsed = runSchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "invalid_body", issues: err.issues }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("invalid body", { status: 400 });
  }

  const def = await resolveDefinition(id, session.organizationId);
  if (!def) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const agent = new Agent(def, registry);

  const runStart = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evt of agent.stream({
          prompt: parsed.prompt,
          context: {
            ...parsed.context,
            userId: session.user.id,
            organizationId: session.organizationId,
          },
        })) {
          controller.enqueue(encoder.encode(sseEncode(evt)));
        }
        // Persist usage. The streaming path does not yet surface token
        // counts (see class comment in `Agent.stream`). TODO(WP-B2):
        // when the unified loop lands, thread the real usage through
        // and drop this zero-cost placeholder.
        try {
          await recordUsage({
            organizationId: session.organizationId,
            userId: session.user.id,
            feature: `agent.run.${def.id}`,
            model: def.model,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            latencyMs: Date.now() - runStart,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[api/agents/run] recordUsage failed", err);
        }
      } catch (err) {
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
}
