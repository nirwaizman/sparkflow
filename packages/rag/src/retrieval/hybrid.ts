import type { Chunk, RetrievalResult } from "../types";
import type { EmbedFn } from "../embeddings/embed";

export interface VectorStore {
  search(query: number[], topK: number): Promise<Array<{ chunk: Chunk; score: number }>>;
}

export interface KeywordSearchFn {
  (query: string, topK: number): Promise<Array<{ chunk: Chunk; score: number }>>;
}

export interface HybridRetrieveArgs {
  query: string;
  vectorStore: VectorStore;
  embed: EmbedFn;
  keywordSearch?: KeywordSearchFn;
  topK?: number;
  /** Weight of vector score in the blended ranking, 0..1. Default 0.7. */
  vectorWeight?: number;
}

/**
 * Hybrid retrieval: blends dense vector search and optional keyword search
 * with reciprocal-rank-fusion-style weighted scores, deduping by chunk id.
 * Actual pgvector / BM25 implementations are injected by the caller.
 */
export async function hybridRetrieve(args: HybridRetrieveArgs): Promise<RetrievalResult> {
  const { query, vectorStore, embed, keywordSearch } = args;
  const topK = args.topK ?? 10;
  const vectorWeight = args.vectorWeight ?? 0.7;
  const keywordWeight = 1 - vectorWeight;

  const started = Date.now();

  const vectors = await embed([query]);
  const queryVec = vectors[0];
  if (!queryVec) {
    return { chunks: [], query, latencyMs: Date.now() - started };
  }

  const [vectorHits, keywordHits] = await Promise.all([
    vectorStore.search(queryVec, topK),
    keywordSearch ? keywordSearch(query, topK) : Promise.resolve([]),
  ]);

  const byId = new Map<string, { chunk: Chunk; score: number }>();

  for (const hit of vectorHits) {
    byId.set(hit.chunk.id, { chunk: hit.chunk, score: hit.score * vectorWeight });
  }
  for (const hit of keywordHits) {
    const existing = byId.get(hit.chunk.id);
    if (existing) {
      existing.score += hit.score * keywordWeight;
    } else {
      byId.set(hit.chunk.id, { chunk: hit.chunk, score: hit.score * keywordWeight });
    }
  }

  const merged = [...byId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    chunks: merged,
    query,
    latencyMs: Date.now() - started,
  };
}
