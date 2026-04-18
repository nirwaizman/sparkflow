import type { ScrapeOptions, ScrapeResult } from "../types";
import { firecrawlScrape } from "./firecrawl";
import { jinaScrape } from "./jina";

/**
 * Strip HTML tags and decode a handful of common entities.
 * Good enough for fallback snippets — prefer Firecrawl/Jina when available.
 */
function basicStrip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Unified scrape entrypoint. Prefers Firecrawl when FIRECRAWL_API_KEY is set,
 * falls back to Jina Reader, then to a plain fetch + basic HTML strip.
 */
export async function scrapeUrl(
  options: ScrapeOptions,
): Promise<ScrapeResult> {
  if (process.env["FIRECRAWL_API_KEY"]) {
    return firecrawlScrape(options);
  }

  try {
    return await jinaScrape(options);
  } catch {
    const res = await fetch(options.url);
    if (!res.ok) {
      throw new Error(`scrapeUrl fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const wantHtml = options.formats?.includes("html") ?? false;
    if (wantHtml) {
      return { url: options.url, content: html, format: "html" };
    }
    return { url: options.url, content: basicStrip(html), format: "text" };
  }
}
