import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Fetch a single URL and return its main textual content.
 *
 * Stub today; real implementation (WP-C2 / WP-E?) will use a headless
 * fetcher with readability extraction.
 */
const parameters = z.object({
  url: z.string().url().describe("Absolute URL to fetch"),
});

type Params = z.infer<typeof parameters>;

export type ScrapeUrlResult = {
  url: string;
  content: string;
};

export const scrapeUrlTool: ToolRegistration<Params, ScrapeUrlResult> = {
  tool: {
    name: "scrape_url",
    description:
      "Fetch an URL and return its main text content. Prefer this over search_web when you already have a URL.",
    parameters,
    handler: async ({ url }) => {
      // eslint-disable-next-line no-console
      console.log(
        `[scrape_url] TODO: implement real fetch + readability extraction. url=${url}`,
      );
      return {
        url,
        content: `… placeholder content for ${url} …`,
      };
    },
  },
  category: "fetch",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 16,
    allowInAutonomousMode: true,
  },
};
