import { NextRequest, NextResponse } from "next/server";
import { chatRequestSchema } from "@sparkflow/shared";
import { generate, defaultModel, heuristicRoute, SYSTEM_PROMPT } from "@sparkflow/llm";
import { searchWeb, stringifySources } from "@/lib/search";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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

    const result = await generate({
      model: defaultModel(),
      system: `${SYSTEM_PROMPT}\n\nOperating mode: ${decision.mode}. Prefer grounded structured answers.${contextBlock}`,
      messages: parsed.messages,
      temperature: 0.4,
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
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: 500 }
    );
  }
}
