import { NextRequest, NextResponse } from "next/server";
import { chatRequestSchema } from "@sparkflow/shared";
import { generate, defaultModel, heuristicRoute, SYSTEM_PROMPT } from "@sparkflow/llm";
import {
  withLlmTrace,
  captureError,
  logger,
  incr,
  observe,
  trackEvent,
} from "@sparkflow/observability";
import { getSession } from "@sparkflow/auth";
import { searchWeb, stringifySources } from "@/lib/search";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestStart = performance.now();
  try {
    // Auth gate with an explicit guest bypass.
    //
    // Callers passing `x-guest-mode: 1` (the public marketing demo +
    // the existing smoke tests) are allowed through unauthenticated.
    // Every other caller must have a valid session. This is
    // intentional and explicit so we don't silently break demos or
    // CI when WP-A3 ships.
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();
    const parsed = chatRequestSchema.parse(body);

    const latestUserMessage = [...parsed.messages].reverse().find((m) => m.role === "user");
    if (!latestUserMessage) {
      return NextResponse.json({ error: "A user message is required." }, { status: 400 });
    }

    const decision = heuristicRoute(latestUserMessage.content);
    const shouldSearch =
      parsed.forceSearch === true ||
      decision.mode === "search" ||
      decision.mode === "research";

    const sources = shouldSearch ? await searchWeb(latestUserMessage.content) : [];

    const contextBlock = sources.length
      ? `\n\nWeb context (use as [1]..[n] citations):\n${stringifySources(sources)}`
      : "";

    const model = defaultModel();

    const result = await withLlmTrace(
      "chat",
      {
        mode: decision.mode,
        model,
        input: latestUserMessage.content,
        tags: [`mode:${decision.mode}`, shouldSearch ? "grounded" : "ungrounded"],
        sourcesCount: sources.length,
      },
      () =>
        generate({
          model,
          system: `${SYSTEM_PROMPT}\n\nOperating mode: ${decision.mode}. Prefer grounded structured answers.${contextBlock}`,
          messages: parsed.messages,
          temperature: 0.4,
        }),
    );

    const latencyMs = Math.round(performance.now() - requestStart);
    incr("chat.request", { mode: decision.mode, grounded: String(shouldSearch) });
    observe("chat.latency_ms", latencyMs, { mode: decision.mode });
    if (result.usage) {
      observe("chat.cost_usd", result.usage.costUsd, { mode: decision.mode });
      observe("chat.tokens_out", result.usage.outputTokens, { mode: decision.mode });
    }
    trackEvent("chat_completed", {
      mode: decision.mode,
      grounded: shouldSearch,
      provider: result.provider,
      model: result.model,
      latencyMs,
      costUsd: result.usage?.costUsd,
    });

    return NextResponse.json({
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.content,
        sources,
        mode: decision.mode,
      },
      meta: {
        provider: result.provider,
        model: result.model,
        planner: decision,
        usage: result.usage,
      },
    });
  } catch (error) {
    captureError(error, { route: "api/chat" });
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "api.chat.failed",
    );
    incr("chat.error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}
