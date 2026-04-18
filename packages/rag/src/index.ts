// @sparkflow/rag — file + web retrieval toolkit (WP-B4 / WP-B5).

export * from "./types";

export { tavilySearch } from "./web/tavily";
export { serpapiSearch } from "./web/serpapi";
export { firecrawlScrape } from "./web/firecrawl";
export { jinaScrape } from "./web/jina";
export { demoSearch, demoScrape } from "./web/demo";
export { searchWeb, searchWebMulti } from "./web/search";
export { scrapeUrl } from "./web/scrape";
export { dedupeSources, diversifyByDomain, normalizeUrl } from "./web/dedupe";
export { rerank } from "./web/rerank";
export type { RerankOptions } from "./web/rerank";

export { parseFile } from "./files/parse";
export type { ParseFileInput, ParsedFile } from "./files/parse";
export { chunkText, estimateTokens } from "./files/chunk";

export { createOpenAIEmbedder, mockEmbedder } from "./embeddings/embed";
export type { EmbedFn, OpenAIEmbedderOptions } from "./embeddings/embed";

export { hybridRetrieve } from "./retrieval/hybrid";
export type {
  VectorStore,
  KeywordSearchFn,
  HybridRetrieveArgs,
} from "./retrieval/hybrid";

export { buildCitedContext, extractCitations, linkCitations } from "./citations";
