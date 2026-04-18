import type { SourceItem } from "@sparkflow/shared";
import type { ScrapeOptions, ScrapeResult, WebSearchOptions } from "../types";

/**
 * Offline demo provider used when no API keys are configured or in tests.
 * Returns deterministic placeholder results so callers can exercise
 * the full pipeline without external dependencies.
 */
export async function demoSearch(
  options: WebSearchOptions,
): Promise<SourceItem[]> {
  const max = options.maxResults ?? 3;
  const out: SourceItem[] = [];
  for (let i = 0; i < max; i++) {
    out.push({
      title: `Demo result ${i + 1} for "${options.query}"`,
      url: `https://example.com/demo/${encodeURIComponent(options.query)}/${i + 1}`,
      snippet: `This is a placeholder snippet #${i + 1} for the query "${options.query}".`,
    });
  }
  return out;
}

export async function demoScrape(options: ScrapeOptions): Promise<ScrapeResult> {
  return {
    url: options.url,
    content: `# Demo scrape\n\nPlaceholder content for ${options.url}.`,
    format: "markdown",
  };
}
