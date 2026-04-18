/**
 * Static pricing table (USD per million tokens) for supported chat models.
 *
 * Numbers come from public provider pages as of April 2026. Update here when
 * vendors publish new prices. `estimateCost` intentionally does not throw for
 * unknown models; unknown combinations return 0 and log a warning so that
 * missing pricing never breaks a user-facing request.
 */

import type { LlmProviderName } from "./types";

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

type ProviderPricing = Record<string, ModelPricing>;

export const PRICING: Record<LlmProviderName, ProviderPricing> = {
  openai: {
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
    "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    o1: { inputPerMillion: 15, outputPerMillion: 60 },
    "o1-mini": { inputPerMillion: 3, outputPerMillion: 12 },
    "o3-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  },
  anthropic: {
    "claude-3-5-sonnet-latest": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-3-5-haiku-latest": { inputPerMillion: 0.8, outputPerMillion: 4 },
    "claude-3-opus-latest": { inputPerMillion: 15, outputPerMillion: 75 },
    // TODO(WP-B1): confirm official pricing for claude-sonnet-4 once published;
    // using claude-3-5-sonnet pricing as a conservative placeholder.
    "claude-sonnet-4": { inputPerMillion: 3, outputPerMillion: 15 },
  },
  google: {
    "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5 },
    "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  },
  groq: {
    "llama-3.3-70b-versatile": { inputPerMillion: 0.59, outputPerMillion: 0.79 },
    "llama-3.1-70b-versatile": { inputPerMillion: 0.59, outputPerMillion: 0.79 },
    "mixtral-8x7b-32768": { inputPerMillion: 0.24, outputPerMillion: 0.24 },
  },
};

/**
 * Estimate USD cost for a (provider, model, tokens) tuple.
 * Returns 0 for unknown combinations and emits a console.warn — never throws.
 */
export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const providerTable = (PRICING as Record<string, ProviderPricing>)[provider];
  if (!providerTable) {
    console.warn(`[pricing] unknown provider "${provider}"; returning 0 cost.`);
    return 0;
  }
  const entry = providerTable[model];
  if (!entry) {
    console.warn(
      `[pricing] no pricing entry for ${provider}/${model}; returning 0 cost.`,
    );
    return 0;
  }
  const cost =
    (inputTokens / 1_000_000) * entry.inputPerMillion +
    (outputTokens / 1_000_000) * entry.outputPerMillion;
  // Round to 6 decimal places to avoid long floats in logs.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
