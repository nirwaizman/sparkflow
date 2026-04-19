import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Query the arXiv API (http://export.arxiv.org/api/query) for recent
 * papers matching a search string. No API key required.
 */
const parameters = z.object({
  query: z.string().min(1).describe("Search query (title, abstract, author)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(25)
    .optional()
    .describe("Max results (default 5)"),
  sortBy: z
    .enum(["relevance", "lastUpdatedDate", "submittedDate"])
    .optional()
    .describe("Sort order (default relevance)"),
});

type Params = z.infer<typeof parameters>;

export type ArxivSearchResult = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published?: string;
  url: string;
};

function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

function pickOne(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = re.exec(xml);
  return m && m[1] !== undefined ? m[1].trim() : undefined;
}

export const arxivSearchTool: ToolRegistration<Params, ArxivSearchResult[]> = {
  tool: {
    name: "arxiv_search",
    description:
      "Search arXiv for scientific papers. Returns title, abstract, authors, and arXiv URL.",
    parameters,
    handler: async ({ query, limit, sortBy }) => {
      const n = limit ?? 5;
      const sort = sortBy ?? "relevance";
      const url =
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}` +
        `&start=0&max_results=${n}&sortBy=${sort}&sortOrder=descending`;
      const res = await fetch(url, {
        headers: { "user-agent": "SparkFlow/arxiv_search" },
      });
      if (!res.ok) return [];
      const xml = await res.text();
      const entries = pickAll(xml, "entry");
      return entries.map((entry) => {
        const id = pickOne(entry, "id") ?? "";
        const authors = pickAll(entry, "author")
          .map((a) => pickOne(a, "name") ?? "")
          .filter(Boolean);
        return {
          id,
          title: (pickOne(entry, "title") ?? "").replace(/\s+/g, " ").trim(),
          summary: (pickOne(entry, "summary") ?? "").replace(/\s+/g, " ").trim(),
          authors,
          published: pickOne(entry, "published"),
          url: id,
        };
      });
    },
  },
  category: "research",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 8,
    allowInAutonomousMode: true,
  },
};
