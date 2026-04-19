import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Generate a spreadsheet via our `/api/sheets/generate` route.
 */
const parameters = z.object({
  title: z.string().min(1).describe("Spreadsheet title"),
  description: z
    .string()
    .optional()
    .describe("What the sheet should contain / compute"),
  columns: z
    .array(z.string())
    .optional()
    .describe("Optional explicit column headers"),
  rows: z
    .number()
    .int()
    .positive()
    .max(1000)
    .optional()
    .describe("Target number of data rows (default 20)"),
  data: z
    .array(z.array(z.union([z.string(), z.number(), z.null()])))
    .optional()
    .describe("Optional pre-built 2D data array (skips generation)"),
});

type Params = z.infer<typeof parameters>;

export type GenerateSheetResult = {
  id?: string;
  url?: string;
  rows?: number;
  columns?: number;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export const generateSheetTool: ToolRegistration<
  Params,
  GenerateSheetResult
> = {
  tool: {
    name: "generate_sheet",
    description:
      "Generate a SparkFlow spreadsheet. Returns sheet id + url.",
    parameters,
    handler: async (args) => {
      try {
        const res = await fetch(`${baseUrl()}/api/sheets/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!res.ok) return { error: `sheets/generate returned ${res.status}` };
        return (await res.json()) as GenerateSheetResult;
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
