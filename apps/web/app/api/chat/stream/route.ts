/**
 * Streaming chat endpoint.
 *
 * Runs the planner, optionally pulls web context, then calls `generateStream`
 * and returns a data-stream response suitable for `useChat` on the client.
 * The legacy JSON endpoint at `/api/chat` is untouched — integrations that
 * depend on the full-response shape keep working.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type PlannerDecision,
  type SourceItem,
} from "@sparkflow/shared";

/**
 * Lenient schema that accepts both our own payload shape (with `id`) and the
 * shape `@ai-sdk/react`'s `useChat` hook posts by default (no `id`, extra
 * fields we ignore). Any missing `id` is filled in on the server with
 * `crypto.randomUUID()`.
 */
const streamRequestSchema = z.object({
  messages: z
    .array(
      z
        .object({
          id: z.string().optional(),
          role: z.enum(["user", "assistant", "system", "tool", "data"]).optional(),
          content: z.string().optional(),
          parts: z.array(z.unknown()).optional(),
        })
        .passthrough(),
    )
    .min(1),
  forceSearch: z.boolean().optional(),
  conversationId: z.string().optional(),
});
import {
  SYSTEM_PROMPT,
  buildGroundingBlock,
  classifyWithLlm,
  generateStream,
  heuristicRoute,
} from "@sparkflow/llm";
import { getSession, type AuthSession } from "@sparkflow/auth";
import { getDb, conversations, messages } from "@sparkflow/db";
import { recordUsage } from "@sparkflow/billing";
import { logger } from "@sparkflow/observability";
import { searchWeb } from "@/lib/search";
import { withMonitor } from "@/lib/monitoring/interceptors";

export const runtime = "nodejs";

const SEARCHY_MODES: PlannerDecision["mode"][] = [
  "search",
  "research",
  "agent_team",
];

async function handlePost(request: NextRequest): Promise<Response> {
  // Auth gate — guest bypass mirrors /api/chat.
  const guestMode = request.headers.get("x-guest-mode") === "1";
  let session: AuthSession | null = null;
  if (!guestMode) {
    session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = streamRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  // Normalise into the internal ChatMessage shape expected downstream.
  // `useChat` from @ai-sdk/react posts messages with {role, content, parts}
  // and sometimes no top-level id. Fill the gaps and drop unsupported roles.
  const parsed = {
    ...parseResult.data,
    messages: parseResult.data.messages
      .filter((m) => m.role !== "data")
      .map((m) => ({
        id: m.id ?? crypto.randomUUID(),
        role: (m.role ?? "user") as "user" | "assistant" | "system" | "tool",
        content:
          typeof m.content === "string" && m.content.length > 0
            ? m.content
            : // `useChat` v4 may put text inside `parts: [{type:"text", text:"..."}]`
              (Array.isArray(m.parts)
                ? m.parts
                    .map((p) => {
                      if (p && typeof p === "object" && "type" in p && (p as { type?: string }).type === "text") {
                        return (p as { text?: string }).text ?? "";
                      }
                      return "";
                    })
                    .filter(Boolean)
                    .join("\n")
                : ""),
      }))
      .filter((m) => m.content.length > 0),
  };

  if (parsed.messages.length === 0) {
    return NextResponse.json(
      { error: "At least one non-empty message is required." },
      { status: 400 },
    );
  }

  const latestUserMessage = [...parsed.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (!latestUserMessage) {
    return NextResponse.json(
      { error: "A user message is required." },
      { status: 400 },
    );
  }

  // Try the LLM classifier first; falls back to heuristic on any error.
  let decision: PlannerDecision;
  try {
    decision = await classifyWithLlm(latestUserMessage.content);
  } catch {
    decision = heuristicRoute(latestUserMessage.content);
  }

  const shouldSearch =
    parsed.forceSearch === true || SEARCHY_MODES.includes(decision.mode);

  let sources: SourceItem[] = [];
  if (shouldSearch) {
    try {
      sources = await searchWeb(latestUserMessage.content);
    } catch (err) {
      console.warn("[chat/stream] searchWeb failed:", err);
    }
  }

  const grounding = buildGroundingBlock(sources);
  const system = `${SYSTEM_PROMPT}\n\nOperating mode: ${decision.mode}. Prefer grounded structured answers.${grounding}`;

  try {
    const streamStart = performance.now();
    const result = generateStream({
      system,
      messages: parsed.messages,
      temperature: 0.4,
    });

    // Fire-and-forget: persist conversation, messages, and usage after
    // the stream finishes. This doesn't block the response.
    if (session) {
      const sess = session;
      const userContent = latestUserMessage.content;
      const mode = decision.mode;

      result.text.then(async (fullText) => {
        const db = getDb();
        const latencyMs = Math.round(performance.now() - streamStart);

        // Create conversation.
        let convId = parsed.conversationId;
        if (!convId) {
          const [row] = await db
            .insert(conversations)
            .values({
              organizationId: sess.organizationId,
              userId: sess.user.id,
              title: userContent.slice(0, 120),
            })
            .returning({ id: conversations.id })
            .catch((err) => {
              logger.error({ err }, "stream.persist.conversation");
              return [] as { id: string }[];
            });
          convId = row?.id;
        }

        // Save user + assistant messages.
        if (convId) {
          await db
            .insert(messages)
            .values([
              {
                conversationId: convId,
                role: "user" as const,
                content: userContent,
                mode,
              },
              {
                conversationId: convId,
                role: "assistant" as const,
                content: fullText,
                mode,
              },
            ])
            .catch((err) => logger.error({ err }, "stream.persist.messages"));
        }

        // Record usage for billing.
        try {
          const usage = await result.usage;
          await recordUsage({
            organizationId: sess.organizationId,
            userId: sess.user.id,
            feature: "chat",
            provider: "stream",
            model: "default",
            inputTokens: usage?.promptTokens ?? 0,
            outputTokens: usage?.completionTokens ?? 0,
            costUsd: 0,
            latencyMs,
          });
        } catch (err) {
          logger.error({ err }, "stream.persist.usage");
        }
      }).catch((err) => logger.error({ err }, "stream.persist"));
    }

    return result.toDataStreamResponse({
      headers: {
        "x-planner-mode": decision.mode,
        "x-planner-reason": encodeURIComponent(decision.reasoning),
        "x-planner-confidence": String(decision.confidence),
        "x-planner-complexity": decision.complexity,
        "x-sources": sources.length
          ? encodeURIComponent(JSON.stringify(sources))
          : "",
      },
    });
  } catch (error) {
    console.error("[chat/stream] generateStream failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to start stream",
      },
      { status: 500 },
    );
  }
}

export const POST = withMonitor("api.chat.stream", handlePost);
