/**
 * Streaming chat endpoint.
 *
 * Runs the planner, optionally pulls web context, then calls `generateStream`
 * and returns a data-stream response suitable for `useChat` on the client.
 * The legacy JSON endpoint at `/api/chat` is untouched — integrations that
 * depend on the full-response shape keep working.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  chatRequestSchema,
  type PlannerDecision,
  type SourceItem,
} from "@sparkflow/shared";
import {
  SYSTEM_PROMPT,
  buildGroundingBlock,
  classifyWithLlm,
  generateStream,
  heuristicRoute,
} from "@sparkflow/llm";
import { searchWeb } from "@/lib/search";

export const runtime = "nodejs";

const SEARCHY_MODES: PlannerDecision["mode"][] = [
  "search",
  "research",
  "agent_team",
];

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = chatRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parseResult.error.flatten() },
      { status: 400 },
    );
  }
  const parsed = parseResult.data;

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
