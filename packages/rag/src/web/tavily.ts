import type { SourceItem } from "@sparkflow/shared";
import type { WebSearchOptions } from "../types";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

/**
 * Tavily web search. Requires TAVILY_API_KEY env.
 * https://docs.tavily.com
 */
export async function tavilySearch(
  options: WebSearchOptions,
  apiKey?: string,
): Promise<SourceItem[]> {
  const key = apiKey ?? process.env["TAVILY_API_KEY"];
  if (!key) {
    throw new Error("TAVILY_API_KEY is required for tavilySearch");
  }

  const body = {
    api_key: key,
    query: options.query,
    max_results: options.maxResults ?? 8,
    search_depth: options.searchDepth ?? "basic",
    include_domains: options.includeDomains,
    exclude_domains: options.excludeDomains,
  };

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Tavily search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as TavilyResponse;
  const results = data.results ?? [];

  return results
    .filter((r): r is TavilyResult & { url: string } => typeof r.url === "string")
    .map((r) => {
      const item: SourceItem = {
        title: r.title ?? r.url,
        url: r.url,
        snippet: r.content ?? "",
      };
      if (r.published_date) item.publishedAt = r.published_date;
      return item;
    });
}
