export interface EmbedFn {
  (texts: string[]): Promise<number[][]>;
}

export interface OpenAIEmbedderOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  batchSize?: number;
}

interface OpenAIEmbeddingItem {
  embedding: number[];
  index: number;
}

interface OpenAIEmbeddingResponse {
  data?: OpenAIEmbeddingItem[];
}

/**
 * Create an embedder that calls OpenAI's /v1/embeddings endpoint.
 * Inputs are batched to `batchSize` (default 100) to stay under request limits.
 */
export function createOpenAIEmbedder(
  options: OpenAIEmbedderOptions = {},
): EmbedFn {
  const model = options.model ?? "text-embedding-3-small";
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const batchSize = options.batchSize ?? 100;

  return async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) return [];
    const key = options.apiKey ?? process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("OPENAI_API_KEY is required for createOpenAIEmbedder");

    const out: number[][] = new Array(texts.length);
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, input: batch }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI embeddings failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as OpenAIEmbeddingResponse;
      const items = data.data ?? [];
      for (const item of items) {
        out[i + item.index] = item.embedding;
      }
    }
    return out;
  };
}

/**
 * Deterministic low-dimensional embedder for tests. Maps each input to an
 * 8-dim vector based on a simple hash of its characters. Not semantically
 * meaningful — just stable across runs.
 */
export const mockEmbedder: EmbedFn = async (texts) => {
  const DIM = 8;
  return texts.map((text) => {
    const vec = new Array<number>(DIM).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const slot = code % DIM;
      vec[slot] = (vec[slot] ?? 0) + (code % 17) / 17;
    }
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    return vec.map((v) => v / norm);
  });
};
