import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Retrieve the top-K semantically-matching chunks for a file via
 * `/api/files/search`.
 */
const parameters = z.object({
  fileId: z.string().min(1).describe("SparkFlow file id"),
  query: z
    .string()
    .min(1)
    .describe("Query that drives chunk relevance ranking"),
  k: z
    .number()
    .int()
    .positive()
    .max(25)
    .optional()
    .describe("Number of chunks to return (default 5)"),
});

type Params = z.infer<typeof parameters>;

export type ReadFileChunksResult = {
  fileId: string;
  chunks: Array<{
    index: number;
    text: string;
    score?: number;
    page?: number;
  }>;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export const readFileChunksTool: ToolRegistration<
  Params,
  ReadFileChunksResult
> = {
  tool: {
    name: "read_file_chunks",
    description:
      "Return the top-K relevant chunks from a file for a query. Cheaper than loading the whole file.",
    parameters,
    handler: async ({ fileId, query, k }) => {
      const limit = k ?? 5;
      try {
        const res = await fetch(`${baseUrl()}/api/files/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileId, query, k: limit }),
        });
        if (!res.ok) {
          return { fileId, chunks: [], error: `files/search returned ${res.status}` };
        }
        const data = (await res.json()) as {
          chunks?: ReadFileChunksResult["chunks"];
        };
        return { fileId, chunks: data.chunks ?? [] };
      } catch (err) {
        return {
          fileId,
          chunks: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "files",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};
