import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Create a document file (md / docx / pdf) from inline content. Stub —
 * real renderers (mdast -> docx / mdast -> pdf) land in WP-F2.
 */
const parameters = z.object({
  format: z.enum(["md", "docx", "pdf"]).describe("Output format"),
  title: z.string().min(1).describe("Document title"),
  content: z.string().min(1).describe("Document body (Markdown)"),
});

type Params = z.infer<typeof parameters>;

export type CreateDocumentResult = {
  path: string;
  format: "md" | "docx" | "pdf";
  title: string;
};

export const createDocumentTool: ToolRegistration<
  Params,
  CreateDocumentResult
> = {
  tool: {
    name: "create_document",
    description:
      "Create a document (md / docx / pdf) from Markdown content. Returns the storage path.",
    parameters,
    handler: async ({ format, title }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[create_document] TODO(WP-F2): implement renderer. format=${format} title=${title}`,
      );
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
      return {
        path: `placeholder://documents/${slug}.${format}`,
        format,
        title,
      };
    },
  },
  category: "document",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 6,
    allowInAutonomousMode: true,
  },
};
