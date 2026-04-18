import type { SourceItem } from "@sparkflow/shared";
import type { WebSearchOptions } from "../types";

interface SerpApiOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
}

/**
 * SerpAPI Google search wrapper. Requires SERPAPI_KEY.
 * https://serpapi.com/search-api
 */
export async function serpapiSearch(
  options: WebSearchOptions,
  apiKey?: string,
): Promise<SourceItem[]> {
  const key = apiKey ?? process.env["SERPAPI_KEY"];
  if (!key) {
    throw new Error("SERPAPI_KEY is required for serpapiSearch");
  }

  const params = new URLSearchParams({
    engine: "google",
    q: options.query,
    api_key: key,
    num: String(options.maxResults ?? 8),
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`SerpAPI search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as SerpApiResponse;
  const organic = data.organic_results ?? [];

  return organic
    .filter((r): r is SerpApiOrganicResult & { link: string } => typeof r.link === "string")
    .map((r) => {
      const item: SourceItem = {
        title: r.title ?? r.link,
        url: r.link,
        snippet: r.snippet ?? "",
      };
      if (r.date) item.publishedAt = r.date;
      return item;
    });
}
