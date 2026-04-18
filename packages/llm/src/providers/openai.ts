import type { GenerateArgs, GenerateResult, LlmProvider } from "../types";

/**
 * Minimal OpenAI chat completions provider.
 * Will be replaced by the Vercel AI SDK adapter in WP-B1 full implementation.
 * This stub exists so apps/web can import a real provider before WP-B1 ships.
 */
export const openaiProvider: LlmProvider = {
  name: "openai",
  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const started = Date.now();
    const body = {
      model: args.model,
      temperature: args.temperature ?? 0.4,
      max_tokens: args.maxTokens,
      messages: [
        ...(args.system ? [{ role: "system", content: args.system }] : []),
        ...args.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = json.choices?.[0]?.message?.content ?? "";
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

    return {
      content,
      provider: "openai",
      model: args.model,
      usage: {
        provider: "openai",
        model: args.model,
        inputTokens,
        outputTokens,
        costUsd: 0, // real pricing table in WP-A5
        latencyMs: Date.now() - started,
      },
    };
  },
};
