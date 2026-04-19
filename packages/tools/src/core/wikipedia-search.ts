import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Search Wikipedia via the public REST API (no key required) and return a
 * compact list of page summaries.
 */
const parameters = z.object({
  query: z.string().min(1).describe("Search query"),
  limit: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Max results to return (default 5)"),
  language: z
    .string()
    .length(2)
    .optional()
    .describe("Wikipedia language code, e.g. 'en' (default) or 'he'"),
});

type Params = z.infer<typeof parameters>;

export type WikipediaSearchResult = {
  title: string;
  description?: string;
  extract?: string;
  url: string;
};

type WikiSearchApiResponse = {
  pages?: Array<{
    title: string;
    description?: string;
    excerpt?: string;
    key: string;
  }>;
};

export const wikipediaSearchTool: ToolRegistration<
  Params,
  WikipediaSearchResult[]
> = {
  tool: {
    name: "wikipedia_search",
    description:
      "Search Wikipedia and return title + short extract + URL for each match. Good for encyclopedic facts.",
    parameters,
    handler: async ({ query, limit, language }) => {
      const n = limit ?? 5;
      const lang = language ?? "en";
      const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(
        query,
      )}&limit=${n}`;
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "SparkFlow/wikipedia_search" },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as WikiSearchApiResponse;
      const pages = data.pages ?? [];
      return pages.map((p) => ({
        title: p.title,
        description: p.description,
        extract: p.excerpt ? p.excerpt.replace(/<[^>]+>/g, "") : undefined,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
      }));
    },
  },
  category: "research",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};
