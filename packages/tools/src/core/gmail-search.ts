import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Search the connected Gmail inbox via our `/api/integrations/gmail/messages`
 * route. Errors gracefully when the user has not connected Gmail.
 */
const parameters = z.object({
  query: z
    .string()
    .min(1)
    .describe("Gmail search query (same syntax as the Gmail UI)"),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Max messages to return (default 10)"),
});

type Params = z.infer<typeof parameters>;

export type GmailSearchResult = {
  messages: Array<{
    id: string;
    threadId?: string;
    from?: string;
    subject?: string;
    snippet?: string;
    date?: string;
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

export const gmailSearchTool: ToolRegistration<Params, GmailSearchResult> = {
  tool: {
    name: "gmail_search",
    description:
      "Search the connected Gmail inbox. Requires the user to have linked Google. Errors gracefully otherwise.",
    parameters,
    handler: async ({ query, limit }) => {
      const n = limit ?? 10;
      try {
        const url = `${baseUrl()}/api/integrations/gmail/messages?q=${encodeURIComponent(
          query,
        )}&limit=${n}`;
        const res = await fetch(url);
        if (res.status === 401 || res.status === 403) {
          return { messages: [], error: "Gmail not connected" };
        }
        if (!res.ok) {
          return { messages: [], error: `gmail returned ${res.status}` };
        }
        const data = (await res.json()) as GmailSearchResult;
        return { messages: data.messages ?? [] };
      } catch (err) {
        return {
          messages: [],
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
