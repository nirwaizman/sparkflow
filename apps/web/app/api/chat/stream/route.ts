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
import { searchWeb } from "@/lib/search";
import { withMonitor } from "@/lib/monitoring/interceptors";

export const runtime = "nodejs";

const SEARCHY_MODES: PlannerDecision["mode"][] = [
  "search",
  "research",
  "agent_team",
];

async function handlePost(request: NextRequest): Promise<Response> {
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
    const result = generateStream({
      system,
      messages: parsed.messages,
      temperature: 0.4,
    });

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
