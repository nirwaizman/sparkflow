import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Drive the headless browser via our internal `/api/browser/run` route.
 * Runs a short action script (navigate / click / extract) and returns the
 * resulting page content + screenshots (when enabled).
 */
const parameters = z.object({
  url: z.string().url().describe("Starting URL to load"),
  actions: z
    .array(
      z.object({
        type: z
          .enum(["goto", "click", "type", "wait", "extract", "screenshot"])
          .describe("Action kind"),
        selector: z.string().optional().describe("CSS selector for click/type"),
        value: z.string().optional().describe("Text value for type action"),
        url: z.string().optional().describe("Target URL for goto"),
        ms: z.number().int().positive().optional().describe("Wait duration"),
      }),
    )
    .optional()
    .describe("Ordered list of browser actions to run after initial load"),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(120_000)
    .optional()
    .describe("Overall timeout (default 30s)"),
});

type Params = z.infer<typeof parameters>;

export type WebBrowseResult = {
  url: string;
  title?: string;
  content?: string;
  screenshotUrl?: string;
  steps?: number;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

export const webBrowseTool: ToolRegistration<Params, WebBrowseResult> = {
  tool: {
    name: "web_browse",
    description:
      "Drive a headless browser: navigate, click, type, extract. Use when a plain fetch won't work (JS-heavy sites, login walls, dynamic content).",
    parameters,
    handler: async ({ url, actions, timeoutMs }) => {
      try {
        const res = await fetch(`${baseUrl()}/api/browser/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, actions: actions ?? [], timeoutMs: timeoutMs ?? 30_000 }),
        });
        if (!res.ok) {
          return { url, error: `browser/run returned ${res.status}` };
        }
        const data = (await res.json()) as WebBrowseResult;
        return { ...data, url: data.url ?? url };
      } catch (err) {
        return { url, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  category: "research",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 3,
    allowInAutonomousMode: true,
  },
};
