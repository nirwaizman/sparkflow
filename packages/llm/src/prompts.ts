import type { SourceItem } from "@sparkflow/shared";

export const SYSTEM_PROMPT = `You are SparkFlow — a premium AI workspace assistant.

Goals:
1. Give concise, accurate, useful answers.
2. Use supplied web/file context when available; cite sources inline as [1], [2].
3. Separate facts from assumptions.
4. If retrieval context is provided, ground answers in it; never invent citations.
5. Respond in the user's language (Hebrew-first when the user writes in Hebrew).
6. End with a short next-step suggestion when helpful.`;

export const ROUTER_PROMPT = `Classify the user request into one of these modes:
- chat: general conversation, writing, coding help, explanation, brainstorming.
- search: current events, prices, comparisons, travel, product updates.
- research: multi-step research, verification, report building.
- task: multi-step automation requiring a background job.
- agent_team: benefits from multiple specialist agents in parallel.
- file: the user is referring to uploaded files / needs file retrieval.
- code: significant code generation or sandbox execution needed.
- image: user wants image generation / editing.
- memory: user wants to save/retrieve/edit personal memories.
- workflow: user is building or running a workflow definition.
- legal: legal research in Hebrew / structured legal reasoning needed.

Return strict JSON: {"mode":"...","confidence":0.0..1.0,"reasoning":"...","tools":[],"complexity":"low|medium|high"}`;

/**
 * Build a retrieval-grounded context block with `[1]..[n]` citation markers.
 * Intended to be appended to the system prompt when the caller has already
 * executed a web/file search. The block ends with an explicit instruction to
 * cite inline so the model doesn't bury the sources.
 */
export function buildGroundingBlock(sources: SourceItem[]): string {
  if (sources.length === 0) return "";
  const lines: string[] = [
    "",
    "## Retrieved context",
    "Cite inline using the numeric marker next to each source, e.g. [1]. Never invent URLs; if the context is insufficient, say so.",
    "",
  ];
  sources.forEach((s, i) => {
    const n = i + 1;
    const published = s.publishedAt ? ` (${s.publishedAt})` : "";
    lines.push(`[${n}] ${s.title}${published}`);
    lines.push(`    URL: ${s.url}`);
    if (s.snippet) {
      lines.push(`    Snippet: ${s.snippet.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}
