import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Parse an uploaded file (by its storage id) into structured text/metadata.
 *
 * Stub — real parsing pipeline (pdf/docx/xlsx/csv) lands with WP-F1.
 */
const parameters = z.object({
  fileId: z.string().min(1).describe("Storage id of the uploaded file"),
});

type Params = z.infer<typeof parameters>;

export type ParseFileResult = {
  fileId: string;
  mimeType: string;
  text: string;
  pages?: number;
};

export const parseFileTool: ToolRegistration<Params, ParseFileResult> = {
  tool: {
    name: "parse_file",
    description:
      "Extract text + metadata from an uploaded file by its storage id. Supports pdf, docx, xlsx, csv, txt, md.",
    parameters,
    handler: async ({ fileId }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[parse_file] TODO(WP-F1): implement multi-format parser. fileId=${fileId}`,
      );
      return {
        fileId,
        mimeType: "text/plain",
        text: "",
      };
    },
  },
  category: "file",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 10,
    allowInAutonomousMode: true,
  },
};
