import type { PlannerDecision } from "@sparkflow/shared";

/**
 * Heuristic router used as fallback for the LLM-based classifier (WP-B2).
 * Keyword list covers English + Hebrew seeds. Real classifier is an LLM call.
 */
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
