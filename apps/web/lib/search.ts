import type { SourceItem } from "@sparkflow/shared";

/**
 * Thin web-search abstraction. Will be replaced by @sparkflow/rag in WP-B5
 * (Tavily + Firecrawl + Jina Reader + dedupe + rerank).
 * For WP-A1 this mirrors the existing starter behavior.
 */

function demoResults(query: string): SourceItem[] {
  return [
    {
      title: `Demo result for ${query}`,
      url: "https://example.com/demo-result-1",
      snippet: "Placeholder result. Add TAVILY_API_KEY or SERPAPI_API_KEY for live results.",
    },
    {
      title: "Architecture pattern",
      url: "https://example.com/architecture",
      snippet: "planner → retrieval → synthesis → citations → actions.",
    },
    {
      title: "Product strategy",
      url: "https://example.com/product-strategy",
      snippet: "Start with one narrow use case and one clear reason to return daily.",
    },
  ];
}

async function tavilySearch(query: string): Promise<SourceItem[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return demoResults(query);

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 6,
      search_depth: "advanced",
    }),
    cache: "no-store",
  });

  if (!response.ok) return demoResults(query);

  const json = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const results = Array.isArray(json.results) ? json.results : [];
  return results.slice(0, 6).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.url ?? "",
    snippet: item.content ?? "",
  }));
}

async function serpapiSearch(query: string): Promise<SourceItem[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return demoResults(query);

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return demoResults(query);

  const json = (await response.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  };
  const organic = Array.isArray(json.organic_results) ? json.organic_results : [];
  return organic.slice(0, 6).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.link ?? "",
    snippet: item.snippet ?? "",
  }));
}

export async function searchWeb(query: string): Promise<SourceItem[]> {
  const provider = process.env.SEARCH_PROVIDER ?? "demo";
  if (provider === "tavily") return tavilySearch(query);
  if (provider === "serpapi") return serpapiSearch(query);
  return demoResults(query);
}

export function stringifySources(sources: SourceItem[]): string {
  return sources
    .map((s, i) => `${i + 1}. ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`)
    .join("\n\n");
}
