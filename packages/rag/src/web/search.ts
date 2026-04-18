import type { SourceItem } from "@sparkflow/shared";
import type { WebSearchOptions } from "../types";
import { tavilySearch } from "./tavily";
import { serpapiSearch } from "./serpapi";
import { demoSearch } from "./demo";
import { firecrawlScrape } from "./firecrawl";

/**
 * Resolve the active web search provider from SEARCH_PROVIDER env.
 * Defaults to "demo" so local dev works offline.
 */
function resolveProvider(): "tavily" | "serpapi" | "demo" {
  const raw = process.env["SEARCH_PROVIDER"]?.toLowerCase();
  if (raw === "tavily" || raw === "serpapi" || raw === "demo") return raw;
  return "demo";
}

export async function searchWeb(
  options: WebSearchOptions,
): Promise<SourceItem[]> {
  const provider = resolveProvider();
  switch (provider) {
    case "tavily":
      return tavilySearch(options);
    case "serpapi":
      return serpapiSearch(options);
    case "demo":
      return demoSearch(options);
  }
}

/**
 * Run primary web search, then opportunistically enrich the top-N results
 * with Firecrawl snippets in parallel. Falls back silently on any failure.
 */
export async function searchWebMulti(
  options: WebSearchOptions,
): Promise<SourceItem[]> {
  const base = await searchWeb(options);
  const hasFirecrawl = Boolean(process.env["FIRECRAWL_API_KEY"]);
  if (!hasFirecrawl || base.length === 0) return base;

  const topN = Math.min(base.length, options.maxResults ?? 3);
  const enrichTargets = base.slice(0, topN);

  const enriched = await Promise.all(
    enrichTargets.map(async (src) => {
      try {
        const scraped = await firecrawlScrape({
          url: src.url,
          formats: ["markdown"],
          onlyMainContent: true,
        });
        const snippet = scraped.content.slice(0, 600);
        return { ...src, snippet: snippet || src.snippet } satisfies SourceItem;
      } catch {
        return src;
      }
    }),
  );

  return [...enriched, ...base.slice(topN)];
}
