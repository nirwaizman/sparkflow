import type { GenerateArgs, GenerateResult, LlmProvider } from "./types";
import { mockProvider } from "./providers/mock";
import { openaiProvider } from "./providers/openai";

/**
 * Minimal gateway. Real multi-provider routing + fallback chain lands in WP-B1.
 * For WP-A1 we only need something that compiles and works end-to-end.
 */
export function selectProvider(): LlmProvider {
  if (process.env.OPENAI_API_KEY) return openaiProvider;
  return mockProvider;
}

export async function generate(args: GenerateArgs): Promise<GenerateResult> {
  const provider = selectProvider();
  return provider.generate(args);
}

export function defaultModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}
