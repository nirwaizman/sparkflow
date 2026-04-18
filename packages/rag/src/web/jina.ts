import type { ScrapeOptions, ScrapeResult } from "../types";

/**
 * Jina Reader. Fetches a URL through r.jina.ai and returns clean markdown.
 * JINA_API_KEY is optional — if present it's sent as Authorization header
 * to raise rate limits; otherwise uses the free public endpoint.
 * https://jina.ai/reader
 */
export async function jinaScrape(
  options: ScrapeOptions,
  apiKey?: string,
): Promise<ScrapeResult> {
  const key = apiKey ?? process.env["JINA_API_KEY"];
  const target = `https://r.jina.ai/${options.url}`;

  const headers: Record<string, string> = { accept: "text/plain" };
  if (key) headers["authorization"] = `Bearer ${key}`;
  if (options.onlyMainContent === false) {
    headers["x-return-format"] = "html";
  }

  const res = await fetch(target, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`Jina scrape failed: ${res.status} ${res.statusText}`);
  }

  const content = await res.text();
  return { url: options.url, content, format: "markdown" };
}
