import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, uuid, vector } from "drizzle-orm/pg-core";
import { files } from "./files";

/**
 * RAG chunks. `embedding` is nullable so a chunk row can be created during
 * ingestion before the embedding job runs.
 *
 * The IVFFlat cosine-ops index on `embedding` is created out-of-band via
 * `POST_MIGRATION_SQL` in `_extensions.ts` — drizzle-kit can't express
 * IVFFlat indexes natively.
 */
export const fileChunks = pgTable(
  "file_chunks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens").notNull().default(0),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    fileChunkIdx: index("file_chunks_file_chunk_idx").on(t.fileId, t.chunkIndex),
  }),
);

export type FileChunk = typeof fileChunks.$inferSelect;
export type NewFileChunk = typeof fileChunks.$inferInsert;
