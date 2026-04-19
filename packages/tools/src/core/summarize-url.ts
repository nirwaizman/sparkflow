import { z } from "zod";
import { generate } from "@sparkflow/llm";
import type { ToolRegistration } from "../types";

/**
 * Fetch an URL and summarise its main text via `generate`. Uses a plain
 * fetch + tag strip to pull content, then feeds to the LLM.
 */
const parameters = z.object({
  url: z.string().url().describe("URL to fetch + summarise"),
  style: z
    .enum(["short", "bullets", "executive"])
    .optional()
    .describe("Summary style (default 'short')"),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(80_000)
    .optional()
    .describe("Max characters of fetched text to feed the LLM (default 15000)"),
});

type Params = z.infer<typeof parameters>;

export type SummarizeUrlResult = {
  url: string;
  summary: string;
  style: "short" | "bullets" | "executive";
  chars: number;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const styleInstruction = (style: "short" | "bullets" | "executive"): string => {
  switch (style) {
    case "bullets":
      return "Return a concise bulleted list (max 6 bullets). No preamble.";
    case "executive":
      return "Return a 3-paragraph executive briefing: context, key findings, recommended actions.";
    default:
      return "Return a single tight paragraph, under 80 words.";
  }
};

export const summarizeUrlTool: ToolRegistration<Params, SummarizeUrlResult> = {
  tool: {
    name: "summarize_url",
    description:
      "Fetch a web page and summarise it. Styles: short | bullets | executive.",
    parameters,
    handler: async ({ url, style, maxChars }) => {
      const resolved = style ?? "short";
      const limit = maxChars ?? 15_000;
      const res = await fetch(url, {
        headers: { "user-agent": "SparkFlow/summarize_url" },
      });
      const html = await res.text();
      const text = stripTags(html).slice(0, limit);
      const result = await generate({
        system:
          "You are a precise summariser. Preserve all facts, drop filler, never fabricate.",
        messages: [
          {
            id: "summarize_url_input",
            role: "user",
            content: `${styleInstruction(resolved)}\n\nSOURCE URL: ${url}\n\nTEXT:\n${text}`,
          },
        ],
        temperature: 0.2,
      });
      return {
        url,
        summary: result.content,
        style: resolved,
        chars: text.length,
      };
    },
  },
  category: "content",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 8,
    allowInAutonomousMode: true,
  },
};
