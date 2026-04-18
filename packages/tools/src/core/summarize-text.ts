import { z } from "zod";
import { generate } from "@sparkflow/llm";
import type { ToolRegistration } from "../types";

/**
 * Summarise arbitrary text. When a real LLM key is available this calls
 * `@sparkflow/llm.generate`; when only the mock provider is active we
 * fall back to a naive head+tail truncation so the tool still returns
 * something useful in tests / offline dev.
 */
const parameters = z.object({
  text: z.string().min(1).describe("Text to summarise"),
  style: z
    .enum(["short", "bullets", "executive"])
    .optional()
    .describe("Summary style (defaults to short)"),
});

type Params = z.infer<typeof parameters>;

export type SummarizeTextResult = {
  summary: string;
  style: "short" | "bullets" | "executive";
};

const hasLlmKey = (): boolean =>
  Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GROQ_API_KEY,
  );

const styleInstruction = (style: "short" | "bullets" | "executive"): string => {
  switch (style) {
    case "bullets":
      return "Return a concise bulleted list (max 6 bullets). No preamble.";
    case "executive":
      return "Return a 3-paragraph executive briefing: context, key findings, recommended actions.";
    case "short":
    default:
      return "Return a single tight paragraph, under 80 words.";
  }
};

/** Naive extractive fallback when no LLM key is configured. */
function truncateHeadTail(text: string, budget = 600): string {
  if (text.length <= budget) return text;
  const half = Math.floor(budget / 2);
  return `${text.slice(0, half)} … ${text.slice(text.length - half)}`;
}

export const summarizeTextTool: ToolRegistration<Params, SummarizeTextResult> = {
  tool: {
    name: "summarize_text",
    description:
      "Summarise a block of text. Styles: short | bullets | executive. Prefer this over writing a summary inline.",
    parameters,
    handler: async ({ text, style }) => {
      const resolved = style ?? "short";
      if (!hasLlmKey()) {
        return {
          summary: truncateHeadTail(text),
          style: resolved,
        };
      }
      const result = await generate({
        system:
          "You are a precise summariser. Preserve all facts, drop filler, never fabricate.",
        messages: [
          {
            id: "summarize_text_input",
            role: "user",
            content: `${styleInstruction(resolved)}\n\nTEXT:\n${text}`,
          },
        ],
        temperature: 0.2,
      });
      return {
        summary: result.content,
        style: resolved,
      };
    },
  },
  category: "text",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};
