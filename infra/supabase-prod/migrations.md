# Supabase production — schema migrations

This doc covers how to apply the Drizzle schema, RLS policies, and pgvector
indexes to the **production** Supabase project safely. Never point a local dev
checkout at this project.

## 0. Prerequisites

- The `supabase` CLI, logged in: `supabase login`.
- Project linked: `supabase link --project-ref <PROD_PROJECT_REF>`.
- `SUPABASE_DB_URL_DIRECT` exported locally (port 5432, not the 6543 pooler —
  migrations need session-level features like `CREATE EXTENSION` and
  advisory locks).
- Drizzle config (`packages/db/drizzle.config.ts`) reads the URL from
  `DATABASE_URL`.

```bash
export DATABASE_URL="$SUPABASE_DB_URL_DIRECT"
```

## 1. Enable required Postgres extensions (idempotent)

Run once per project — these are ordinary SQL, not Drizzle migrations, because
they require the `postgres` superuser role that `drizzle-kit` doesn't have.

```sql
-- Run in Supabase SQL editor (Dashboard → SQL editor) as a one-off:
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "vector";          -- pgvector, for embeddings
create extension if not exists "pg_trgm";         -- fuzzy text search
create extension if not exists "pg_stat_statements";
```

Confirm with `select extname, extversion from pg_extension;`.

## 2. Push schema with drizzle-kit

We use `drizzle-kit push` (not `generate`/`migrate`) for the first deploy and
migrations thereafter. Push diffs the live schema against the TS models and
applies changes — for production, always pass `--strict` so you review each
statement.

```bash
# From the repo root
pnpm --filter @sparkflow/db db:push -- --strict
# Equivalent to:
#   drizzle-kit push --config=packages/db/drizzle.config.ts --strict
```

`--strict` will:
1. Print every statement drizzle intends to run.
2. Highlight destructive ops (DROP COLUMN / DROP TABLE) in red.
3. Wait for `y/N` confirmation.

**Refuse to proceed** if you see a destructive statement you did not expect —
most likely cause is a stale branch or wrong `DATABASE_URL`.

### Safety checklist before typing `y`

- [ ] The prompt says the target host is `db.<PROD_REF>.supabase.co`.
- [ ] A fresh Supabase backup exists (Dashboard → Database → Backups → "Run now").
- [ ] You are on the commit you intend to deploy (`git status` clean, on `main`).
- [ ] No DROP / RENAME you didn't write yourself.

## 3. Apply RLS policies

Drizzle doesn't own RLS (policies live in `infra/supabase-prod/rls.sql`
alongside the schema they protect). Apply them after every schema push:

```bash
psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -f infra/supabase-prod/rls.sql
```

The script is written to be idempotent — every `create policy` is paired with a
`drop policy if exists` above it, and every `alter table ... enable row level
security` is safe to re-run.

Smoke-test RLS with the anon key against a known workspace you own:

```bash
# Should return only rows belonging to the auth.uid() whose JWT you use.
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/documents?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT"
```

## 4. Create pgvector indexes

`drizzle-kit push` creates the `embedding vector(1536)` columns but does not
create the ANN index — that needs `ivfflat`/`hnsw` parameters drizzle doesn't
model. Run once per table after the first push:

```sql
-- documents.embedding (cosine distance, ~100k rows → lists=100)
create index concurrently if not exists documents_embedding_idx
  on documents
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- chat_messages.embedding
create index concurrently if not exists chat_messages_embedding_idx
  on chat_messages
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- After populating data, run ANALYZE so the planner picks the index:
analyze documents;
analyze chat_messages;
```

Tune `lists` ≈ `sqrt(row_count)` once row count exceeds ~1M. For > 5M rows,
switch to `hnsw` (`using hnsw (embedding vector_cosine_ops) with (m = 16,
ef_construction = 64)`).

`create index concurrently` cannot run inside a transaction — run it
statement-by-statement, not as part of a script with `BEGIN`.

## 5. Verify

```bash
# Schema
psql "$SUPABASE_DB_URL_DIRECT" -c "\dt public.*"

# RLS is on for every user-data table
psql "$SUPABASE_DB_URL_DIRECT" -c \
  "select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r';"

# pgvector indexes exist
psql "$SUPABASE_DB_URL_DIRECT" -c \
  "select indexname, indexdef from pg_indexes where indexdef ilike '%vector%';"
```

## 6. Rollback

Drizzle push has no built-in down migration. Rollback strategy:

1. Restore the pre-migration backup (see `backup.md`).
2. Or, for additive changes only, write a manual `alter table ... drop column`
   SQL and apply with `psql`.

For any destructive migration, *always* take a fresh point-in-time backup
immediately before running `drizzle-kit push` — the Dashboard PITR window is
7 days on Pro, 30 days on Team.
