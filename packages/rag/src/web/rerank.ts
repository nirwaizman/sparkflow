import type { SourceItem } from "@sparkflow/shared";

interface CohereRerankResult {
  index: number;
  relevance_score: number;
}

interface CohereRerankResponse {
  results?: CohereRerankResult[];
}

export interface RerankOptions {
  provider?: "cohere" | "jina" | "none";
  model?: string;
  topK?: number;
}

/**
 * Rerank a list of sources against a query.
 *
 * - "cohere": uses https://api.cohere.com/v2/rerank (requires COHERE_API_KEY)
 * - "jina":   uses https://api.jina.ai/v1/rerank (requires JINA_API_KEY)
 * - "none" or missing key: identity passthrough
 *
 * Any network failure is swallowed and the original order is returned, so
 * callers can treat this as a best-effort enrichment step.
 */
export async function rerank(
  query: string,
  sources: SourceItem[],
  opts: RerankOptions = {},
): Promise<SourceItem[]> {
  if (sources.length === 0) return sources;
  const provider = opts.provider ?? (process.env["COHERE_API_KEY"] ? "cohere" : "none");
  if (provider === "none") return sources;

  try {
    if (provider === "cohere") {
      return await cohereRerank(query, sources, opts);
    }
    if (provider === "jina") {
      return await jinaRerank(query, sources, opts);
    }
  } catch {
    // Gracefully degrade to identity on any transport/parse error.
    return sources;
  }
  return sources;
}

async function cohereRerank(
  query: string,
  sources: SourceItem[],
  opts: RerankOptions,
): Promise<SourceItem[]> {
  const key = process.env["COHERE_API_KEY"];
  if (!key) return sources;

  const documents = sources.map((s) => `${s.title}\n${s.snippet}`);
  const body = {
    model: opts.model ?? "rerank-english-v3.0",
    query,
    documents,
    top_n: opts.topK ?? sources.length,
  };

  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return sources;

  const data = (await res.json()) as CohereRerankResponse;
  const results = data.results ?? [];
  const ordered: SourceItem[] = [];
  for (const r of results) {
    const match = sources[r.index];
    if (match) ordered.push(match);
  }
  return ordered.length > 0 ? ordered : sources;
}

async function jinaRerank(
  query: string,
  sources: SourceItem[],
  opts: RerankOptions,
): Promise<SourceItem[]> {
  const key = process.env["JINA_API_KEY"];
  if (!key) return sources;

  const body = {
    model: opts.model ?? "jina-reranker-v2-base-multilingual",
    query,
    documents: sources.map((s) => `${s.title}\n${s.snippet}`),
    top_n: opts.topK ?? sources.length,
  };

  const res = await fetch("https://api.jina.ai/v1/rerank", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return sources;

  const data = (await res.json()) as CohereRerankResponse;
  const results = data.results ?? [];
  const ordered: SourceItem[] = [];
  for (const r of results) {
    const match = sources[r.index];
    if (match) ordered.push(match);
  }
  return ordered.length > 0 ? ordered : sources;
}
