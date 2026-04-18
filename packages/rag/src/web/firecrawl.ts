import type { ScrapeOptions, ScrapeResult } from "../types";

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    html?: string;
    content?: string;
  };
}

/**
 * Firecrawl scrape endpoint. Requires FIRECRAWL_API_KEY.
 * https://docs.firecrawl.dev/api-reference/endpoint/scrape
 */
export async function firecrawlScrape(
  options: ScrapeOptions,
  apiKey?: string,
): Promise<ScrapeResult> {
  const key = apiKey ?? process.env["FIRECRAWL_API_KEY"];
  if (!key) {
    throw new Error("FIRECRAWL_API_KEY is required for firecrawlScrape");
  }

  const formats = options.formats ?? ["markdown"];
  const body = {
    url: options.url,
    formats,
    onlyMainContent: options.onlyMainContent ?? true,
  };

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Firecrawl scrape failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as FirecrawlScrapeResponse;
  const data = json.data ?? {};

  const markdown = data.markdown;
  const html = data.html;
  const text = data.content;

  if (formats.includes("markdown") && typeof markdown === "string") {
    return { url: options.url, content: markdown, format: "markdown" };
  }
  if (formats.includes("html") && typeof html === "string") {
    return { url: options.url, content: html, format: "html" };
  }
  if (formats.includes("text") && typeof text === "string") {
    return { url: options.url, content: text, format: "text" };
  }

  return {
    url: options.url,
    content: markdown ?? text ?? html ?? "",
    format: "markdown",
  };
}
