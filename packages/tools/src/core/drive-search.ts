import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * List files in the user's connected Google Drive via
 * `/api/integrations/google/drive/list`.
 */
const parameters = z.object({
  query: z
    .string()
    .optional()
    .describe("Drive query (same syntax as Drive UI)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe("Max files to return (default 20)"),
  mimeType: z
    .string()
    .optional()
    .describe("Filter by MIME type (e.g. 'application/pdf')"),
});

type Params = z.infer<typeof parameters>;

export type DriveSearchResult = {
  files: Array<{
    id: string;
    name: string;
    mimeType?: string;
    modifiedTime?: string;
    webViewLink?: string;
    size?: number;
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

export const driveSearchTool: ToolRegistration<Params, DriveSearchResult> = {
  tool: {
    name: "drive_search",
    description:
      "Search / list files in the user's Google Drive. Requires the user to have linked Google.",
    parameters,
    handler: async ({ query, limit, mimeType }) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (mimeType) params.set("mimeType", mimeType);
      params.set("limit", String(limit ?? 20));
      try {
        const res = await fetch(
          `${baseUrl()}/api/integrations/google/drive/list?${params.toString()}`,
        );
        if (res.status === 401 || res.status === 403) {
          return { files: [], error: "Google Drive not connected" };
        }
        if (!res.ok) {
          return { files: [], error: `drive returned ${res.status}` };
        }
        const data = (await res.json()) as DriveSearchResult;
        return { files: data.files ?? [] };
      } catch (err) {
        return {
          files: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "integrations",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 8,
    allowInAutonomousMode: true,
  },
};
