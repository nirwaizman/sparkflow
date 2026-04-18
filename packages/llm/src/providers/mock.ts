/**
 * Development-only provider. Echoes the last user message. Used when no
 * real API keys are configured so the rest of the app still functions.
 */

import type {
  GenerateArgs,
  GenerateResult,
  LlmProvider,
  StreamChunk,
} from "../types";

const MOCK_MODEL = "mock-1";

function preview(args: GenerateArgs): string {
  const lastUser = [...args.messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.content.slice(0, 200) ?? "(no user message)";
  return `[mock provider] No API key configured. Echoing prompt for dev:\n\n${text}`;
}

export const mockProvider: LlmProvider = {
  name: "mock",

  async generate(args: GenerateArgs): Promise<GenerateResult> {
    const start = Date.now();
    const content = preview(args);
    return {
      content,
      provider: "mock",
      model: args.model ?? MOCK_MODEL,
      finishReason: "stop",
      usage: {
        provider: "mock",
        model: args.model ?? MOCK_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - start,
      },
    };
  },

  async *stream(args: GenerateArgs): AsyncIterable<StreamChunk> {
    const start = Date.now();
    const content = preview(args);
    // Emit a few deltas so consumers can exercise chunked handling.
    const chunks = content.match(/.{1,32}/g) ?? [content];
    for (const chunk of chunks) {
      yield { done: false, delta: chunk };
    }
    yield {
      done: true,
      finishReason: "stop",
      usage: {
        provider: "mock",
        model: args.model ?? MOCK_MODEL,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - start,
      },
    };
  },
};
