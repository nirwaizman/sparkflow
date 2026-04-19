import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Extract readable text from an URL. Prefers Jina Reader (r.jina.ai) when
 * `JINA_API_KEY` is set — it returns clean Markdown for even gnarly pages.
 * Falls back to a plain `fetch` + tag-stripping otherwise.
 */
const parameters = z.object({
  url: z.string().url().describe("URL to extract text from"),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(200_000)
    .optional()
    .describe("Truncate output to this many characters (default 20000)"),
});

type Params = z.infer<typeof parameters>;

export type ExtractTextResult = {
  url: string;
  text: string;
  provider: "jina" | "fallback";
  truncated: boolean;
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const extractTextTool: ToolRegistration<Params, ExtractTextResult> = {
  tool: {
    name: "extract_text",
    description:
      "Fetch a URL and return clean readable text. Uses Jina Reader when JINA_API_KEY is set, else raw fetch + tag strip.",
    parameters,
    handler: async ({ url, maxChars }) => {
      const limit = maxChars ?? 20_000;
      const jinaKey = process.env.JINA_API_KEY;
      let text = "";
      let provider: "jina" | "fallback" = "fallback";

      if (jinaKey) {
        try {
          const res = await fetch(`https://r.jina.ai/${url}`, {
            headers: {
              authorization: `Bearer ${jinaKey}`,
              accept: "text/plain",
            },
          });
          if (res.ok) {
            text = await res.text();
            provider = "jina";
          }
        } catch {
          // fall through
        }
      }

      if (!text) {
        const res = await fetch(url, {
          headers: { "user-agent": "SparkFlow/extract_text" },
        });
        const html = await res.text();
        text = stripTags(html);
      }

      const truncated = text.length > limit;
      return {
        url,
        text: truncated ? text.slice(0, limit) : text,
        provider,
        truncated,
      };
    },
  },
  category: "research",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};
