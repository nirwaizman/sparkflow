/**
 * Request router: maps a user input to a `PlannerDecision`.
 *
 * Two paths exist:
 *  - `heuristicRoute`: fast, zero-cost keyword match. Also the final fallback.
 *  - `classifyWithLlm`: prompts a model to emit a structured `PlannerDecision`
 *    matching `plannerDecisionSchema`. Any failure (provider error, invalid
 *    JSON, validation error) degrades gracefully back to `heuristicRoute`.
 */

import type { PlannerDecision } from "@sparkflow/shared";
import { plannerDecisionSchema } from "@sparkflow/shared";
import { generateObjectHelper } from "./structured";
import { ROUTER_PROMPT } from "./prompts";
import type { LlmProviderName } from "./types";

const SEARCH_HINTS = [
  // en
  "today",
  "latest",
  "news",
  "price",
  "compare",
  "flight",
  "hotel",
  "best",
  "current",
  "2025",
  "2026",
  // he
  "היום",
  "אחרון",
  "מחיר",
  "השווה",
  "עדכני",
];

const RESEARCH_HINTS = [
  "research",
  "report",
  "verify",
  "citations",
  "sources",
  "analyze",
  "deep dive",
  "investigate",
  "מחקר",
  "דוח",
  "אמת",
  "נתח",
  "חקור",
];

export function heuristicRoute(input: string): PlannerDecision {
  const text = input.toLowerCase();

  if (RESEARCH_HINTS.some((h) => text.includes(h))) {
    return {
      mode: "research",
      confidence: 0.6,
      reasoning: "Heuristic: research/evidence keyword match.",
      tools: ["search_web", "scrape_url"],
      complexity: "high",
    };
  }

  if (SEARCH_HINTS.some((h) => text.includes(h))) {
    return {
      mode: "search",
      confidence: 0.6,
      reasoning: "Heuristic: fresh-info keyword match.",
      tools: ["search_web"],
      complexity: "medium",
    };
  }

  return {
    mode: "chat",
    confidence: 0.5,
    reasoning: "Heuristic default: no retrieval cue detected.",
    tools: [],
    complexity: "low",
  };
}

export type ClassifyOptions = {
  model?: string;
  provider?: LlmProviderName;
};

/**
 * Call the router LLM to classify the request. Returns `heuristicRoute(input)`
 * on any error. Never throws.
 */
export async function classifyWithLlm(
  input: string,
  opts?: ClassifyOptions,
): Promise<PlannerDecision> {
  try {
    const { object } = await generateObjectHelper<PlannerDecision>({
      schema: plannerDecisionSchema,
      system: ROUTER_PROMPT,
      messages: [
        { id: "router-in", role: "user", content: input },
      ],
      model: opts?.model,
      provider: opts?.provider,
      temperature: 0.1,
    });
    return object;
  } catch (err) {
    console.warn(
      `[router] classifyWithLlm failed, falling back to heuristic: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return heuristicRoute(input);
  }
}
