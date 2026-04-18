// Shared RAG type surface for WP-B4 (file RAG) and WP-B5 (web RAG).

export type RagProviderName =
  | "tavily"
  | "serpapi"
  | "firecrawl"
  | "jina"
  | "demo";

export interface WebSearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
}

export type ScrapeFormat = "markdown" | "html" | "text";

export interface ScrapeOptions {
  url: string;
  formats?: ScrapeFormat[];
  onlyMainContent?: boolean;
}

export interface ChunkingOptions {
  targetTokens?: number;
  overlap?: number;
  strategy?: "fixed" | "semantic";
}

export interface Chunk {
  id: string;
  content: string;
  tokens: number;
  metadata: Record<string, unknown>;
}

export type EmbeddedChunk = Chunk & { embedding: number[] };

export interface RetrievalResult {
  chunks: Array<{ chunk: Chunk; score: number }>;
  query: string;
  latencyMs: number;
}

export interface ScrapeResult {
  url: string;
  content: string;
  format: ScrapeFormat;
}

export class UnsupportedMimeError extends Error {
  readonly mime: string;
  constructor(mime: string) {
    super(`Unsupported mime type: ${mime}`);
    this.name = "UnsupportedMimeError";
    this.mime = mime;
  }
}
