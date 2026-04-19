import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Fetch the current top stories from Hacker News via the firebase API.
 * Pure public endpoint, no key required.
 */
const parameters = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(30)
    .optional()
    .describe("Max stories to return (default 10)"),
  kind: z
    .enum(["top", "new", "best"])
    .optional()
    .describe("Which HN feed to use (default 'top')"),
});

type Params = z.infer<typeof parameters>;

export type HackerNewsItem = {
  id: number;
  title: string;
  url?: string;
  by?: string;
  score?: number;
  descendants?: number;
  time?: number;
  hnUrl: string;
};

export const hackerNewsTopTool: ToolRegistration<Params, HackerNewsItem[]> = {
  tool: {
    name: "hacker_news_top",
    description:
      "Fetch the current top/new/best stories from Hacker News. Good pulse on tech news.",
    parameters,
    handler: async ({ limit, kind }) => {
      const n = limit ?? 10;
      const feed = kind ?? "top";
      const idsRes = await fetch(
        `https://hacker-news.firebaseio.com/v0/${feed}stories.json`,
      );
      if (!idsRes.ok) return [];
      const ids = ((await idsRes.json()) as number[]).slice(0, n);
      const items = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await fetch(
              `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            );
            if (!r.ok) return null;
            const it = (await r.json()) as HackerNewsItem;
            return {
              ...it,
              hnUrl: `https://news.ycombinator.com/item?id=${id}`,
            } as HackerNewsItem;
          } catch {
            return null;
          }
        }),
      );
      return items.filter((x): x is HackerNewsItem => x !== null);
    },
  },
  category: "research",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 6,
    allowInAutonomousMode: true,
  },
};
