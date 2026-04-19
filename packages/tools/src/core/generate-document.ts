import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Generate a long-form document via our `/api/docs/generate` route.
 */
const parameters = z.object({
  title: z.string().min(1).describe("Document title"),
  prompt: z
    .string()
    .min(1)
    .describe("What the document should say / outline"),
  format: z
    .enum(["md", "docx", "pdf"])
    .optional()
    .describe("Output format (default 'md')"),
  tone: z.string().optional().describe("Tone / register"),
  sections: z
    .array(z.string())
    .optional()
    .describe("Optional explicit section headings"),
});

type Params = z.infer<typeof parameters>;

export type GenerateDocumentResult = {
  id?: string;
  url?: string;
  format?: "md" | "docx" | "pdf";
  wordCount?: number;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export const generateDocumentTool: ToolRegistration<
  Params,
  GenerateDocumentResult
> = {
  tool: {
    name: "generate_document",
    description:
      "Generate a SparkFlow long-form document (md / docx / pdf). Returns doc id + url.",
    parameters,
    handler: async (args) => {
      try {
        const res = await fetch(`${baseUrl()}/api/docs/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!res.ok) return { error: `docs/generate returned ${res.status}` };
        return (await res.json()) as GenerateDocumentResult;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  category: "content",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 4,
    allowInAutonomousMode: true,
  },
};
