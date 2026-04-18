/**
 * Concrete `VectorStore` backed by Postgres + pgvector.
 *
 * Scoped to a single organization (and optionally a single file). We
 * join `file_chunks` to `files` so we can filter by `organization_id`
 * without denormalising the chunk rows.
 *
 * Similarity is cosine (`<=>`). Drizzle's `sql` template lets us inline
 * a pgvector literal safely.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@sparkflow/db";
import type { Chunk } from "@sparkflow/rag";
import type { VectorStore } from "@sparkflow/rag";

export interface PgVectorStoreOptions {
  organizationId: string;
  /** Restrict search to a single file (useful for per-document Q&A). */
  fileId?: string;
}

interface Row {
  id: string;
  content: string;
  tokens: number;
  metadata: Record<string, unknown> | null;
  file_id: string;
  distance: number;
}

function vectorLiteral(vec: number[]): string {
  // pgvector accepts a "[n1,n2,...]" literal.
  return `[${vec.join(",")}]`;
}

export function createPgVectorStore(opts: PgVectorStoreOptions): VectorStore {
  const { organizationId, fileId } = opts;

  return {
    async search(query: number[], topK: number) {
      if (query.length === 0) return [];
      const db = getDb();
      const literal = vectorLiteral(query);

      const rows = (await db.execute(sql`
        select
          fc.id,
          fc.content,
          fc.tokens,
          fc.metadata,
          fc.file_id,
          (fc.embedding <=> ${literal}::vector) as distance
        from file_chunks fc
        inner join files f on f.id = fc.file_id
        where f.organization_id = ${organizationId}
          and fc.embedding is not null
          ${fileId ? sql`and fc.file_id = ${fileId}` : sql``}
        order by fc.embedding <=> ${literal}::vector
        limit ${topK}
      `)) as unknown as Row[];

      return rows.map((r) => {
        // Cosine distance is 0..2; map to a similarity-like score in 0..1.
        const score = 1 - Math.min(Math.max(r.distance, 0), 2) / 2;
        const chunk: Chunk = {
          id: r.id,
          content: r.content,
          tokens: r.tokens,
          metadata: {
            ...(r.metadata ?? {}),
            fileId: r.file_id,
          },
        };
        return { chunk, score };
      });
    },
  };
}
