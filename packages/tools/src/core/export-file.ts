import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Export an existing file to a different format. Stub — depends on the
 * rendering pipeline from WP-F2.
 */
const parameters = z.object({
  fileId: z.string().min(1).describe("Source file id"),
  format: z.enum(["pdf", "md", "txt"]).describe("Target format"),
});

type Params = z.infer<typeof parameters>;

export type ExportFileResult = {
  fileId: string;
  format: "pdf" | "md" | "txt";
  path: string;
};

export const exportFileTool: ToolRegistration<Params, ExportFileResult> = {
  tool: {
    name: "export_file",
    description:
      "Export an existing file to pdf / md / txt. Returns the path of the exported artifact.",
    parameters,
    handler: async ({ fileId, format }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[export_file] TODO(WP-F2): implement exporter. fileId=${fileId} format=${format}`,
      );
      return {
        fileId,
        format,
        path: `placeholder://exports/${fileId}.${format}`,
      };
    },
  },
  category: "file",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 6,
    allowInAutonomousMode: true,
  },
};
