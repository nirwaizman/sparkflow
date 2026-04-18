/**
 * Postgres extensions required by the SparkFlow schema.
 *
 * These are emitted as raw SQL and should be applied once, ahead of any
 * generated migrations. drizzle-kit does not manage extensions for us.
 *
 * - `pgcrypto`: provides `gen_random_uuid()` used as default for uuid PKs.
 * - `vector`  : pgvector — required for embedding columns on `file_chunks`
 *               and `memories`. Supabase projects have this available.
 * - `pg_trgm`: trigram index support for fuzzy text search (LIKE/ILIKE).
 *
 * The `ENABLE_EXTENSIONS_SQL` constant is a single SQL blob that can be
 * executed by the seed/bootstrap script or copy-pasted into the Supabase
 * SQL editor. It's idempotent (`CREATE EXTENSION IF NOT EXISTS`).
 */

export const ENABLE_EXTENSIONS_SQL = /* sql */ `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
`;

/**
 * Extra post-migration SQL that drizzle-kit can't express directly, notably
 * IVFFlat cosine indexes on embedding columns. Run after `db:push`.
 */
export const POST_MIGRATION_SQL = /* sql */ `
-- IVFFlat ANN index for file chunk embeddings (cosine distance).
CREATE INDEX IF NOT EXISTS file_chunks_embedding_ivfflat
  ON file_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- IVFFlat ANN index for memory embeddings (cosine distance).
CREATE INDEX IF NOT EXISTS memories_embedding_ivfflat
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
`;
