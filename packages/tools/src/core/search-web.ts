import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Web search tool. Currently returns demo data — the real implementation
 * will call into `@sparkflow/rag` once its web search adapter exists.
 *
 * TODO(rag): replace the stub body with `import { searchWeb } from
 * "@sparkflow/rag"` and forward query+limit.
 */
const parameters = z.object({
  query: z.string().min(1).describe("Search query string"),
  limit: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe("Max results to return (default 5)"),
});

type Params = z.infer<typeof parameters>;

export type SearchWebResult = {
  title: string;
  url: string;
  snippet: string;
};

export const searchWebTool: ToolRegistration<Params, SearchWebResult[]> = {
  tool: {
    name: "search_web",
    description:
      "Search the public web and return a ranked list of result snippets. Use for fresh / external facts not in memory.",
    parameters,
    handler: async ({ query, limit }) => {
      const n = limit ?? 5;
      // eslint-disable-next-line no-console
      console.log(
        `[search_web] TODO(rag): wire to @sparkflow/rag.searchWeb. query=${query} limit=${n}`,
      );
      const out: SearchWebResult[] = [];
      for (let i = 1; i <= Math.min(n, 3); i++) {
        out.push({
          title: `Demo result ${i} for "${query}"`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}&r=${i}`,
          snippet: `Placeholder snippet ${i}. Replace with real RAG search results.`,
        });
      }
      return out;
    },
  },
  category: "search",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 8,
    allowInAutonomousMode: true,
  },
};
