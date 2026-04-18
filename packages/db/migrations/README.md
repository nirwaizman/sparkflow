# Migrations

Drizzle-generated SQL migrations live in this directory. They are produced from
`src/schema/*.ts` by `drizzle-kit`:

```bash
pnpm -C packages/db db:generate   # writes <timestamp>_<name>.sql files here
pnpm -C packages/db db:push       # applies the current schema to the DB
```

## What is checked in

- Generated `*.sql` migration files (commit them — they are the source of
  truth for CI and prod).
- `meta/` journal files written alongside them by drizzle-kit.
- `rls.sql` — a hand-written migration that enables Row-Level Security and
  installs tenant-isolation policies on every tenant-scoped table. Apply it
  **after** `db:push` and re-apply any time a new tenant-scoped table is
  added. It is idempotent (uses `DROP POLICY IF EXISTS` + `CREATE POLICY`).

## First-time setup order

1. Enable required Postgres extensions. The SQL is exported as
   `ENABLE_EXTENSIONS_SQL` from `src/schema/_extensions.ts`. Run it once in
   the Supabase SQL editor (or via `psql` against `DIRECT_URL`).
2. `pnpm -C packages/db db:push` — creates the tables.
3. Apply `migrations/rls.sql` — turns on RLS and installs policies.
4. Run `POST_MIGRATION_SQL` (also exported from `_extensions.ts`) to create
   the IVFFlat ANN indexes on embedding columns. These can't be expressed
   via drizzle-kit today.
5. `pnpm -C packages/db db:seed` — inserts the demo org/user/conversation.
