import { z } from "zod";
import { generate } from "@sparkflow/llm";
import type { ToolRegistration } from "../types";

/**
 * Summarise a file by pulling its top-K relevant chunks (or a head slice
 * when no query is given) and feeding them to `generate`.
 */
const parameters = z.object({
  fileId: z.string().min(1).describe("SparkFlow file id"),
  query: z
    .string()
    .optional()
    .describe("Optional focus query (if omitted, uses a generic summary)"),
  style: z
    .enum(["short", "bullets", "executive"])
    .optional()
    .describe("Summary style (default 'short')"),
  k: z
    .number()
    .int()
    .positive()
    .max(25)
    .optional()
    .describe("Chunks to pull for context (default 8)"),
});

type Params = z.infer<typeof parameters>;

export type SummarizeFileResult = {
  fileId: string;
  summary: string;
  style: "short" | "bullets" | "executive";
  chunksUsed: number;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

const styleInstruction = (style: "short" | "bullets" | "executive"): string => {
  switch (style) {
    case "bullets":
      return "Return a concise bulleted list (max 8 bullets).";
    case "executive":
      return "Return a 3-paragraph executive briefing: context, key findings, recommended actions.";
    default:
      return "Return a single tight paragraph, under 100 words.";
  }
};

export const summarizeFileTool: ToolRegistration<
  Params,
  SummarizeFileResult
> = {
  tool: {
    name: "summarize_file",
    description:
      "Summarise a stored file by id. Optionally focus on a query. Uses retrieval to stay within context budget.",
    parameters,
    handler: async ({ fileId, query, style, k }) => {
      const resolved = style ?? "short";
      const limit = k ?? 8;
      try {
        const res = await fetch(`${baseUrl()}/api/files/search`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileId,
            query: query ?? "overall summary, main points, conclusions",
            k: limit,
          }),
        });
        if (!res.ok) {
          return {
            fileId,
            summary: "",
            style: resolved,
            chunksUsed: 0,
            error: `files/search returned ${res.status}`,
          };
        }
        const data = (await res.json()) as {
          chunks?: Array<{ text: string; index: number }>;
        };
        const chunks = data.chunks ?? [];
        const joined = chunks
          .map((c, i) => `--- chunk ${i + 1} ---\n${c.text}`)
          .join("\n\n");
        const result = await generate({
          system:
            "You are a precise summariser of documents. Preserve facts. Never fabricate.",
          messages: [
            {
              id: "summarize_file_input",
              role: "user",
              content: `${styleInstruction(resolved)}\n\n${
                query ? `FOCUS: ${query}\n\n` : ""
              }DOCUMENT CHUNKS:\n${joined}`,
            },
          ],
          temperature: 0.2,
        });
        return {
          fileId,
          summary: result.content,
          style: resolved,
          chunksUsed: chunks.length,
        };
      } catch (err) {
        return {
          fileId,
          summary: "",
          style: resolved,
          chunksUsed: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "files",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 8,
    allowInAutonomousMode: true,
  },
};
