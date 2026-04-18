# WP-A2 — Database Schema (Drizzle + Supabase + pgvector)

**Self-contained brief.** Hand this to any AI coding tool.

## Context
You are working in the SparkFlow monorepo at `~/sparkflow` (pnpm + Turbo). WP-A1 (monorepo bootstrap) is complete. The master plan lives at `~/.claude/plans/distributed-napping-moonbeam.md`. The current repo has `packages/db` as a stub — your job is to make it real.

## Goal
Deliver a production-grade multi-tenant Postgres schema with Drizzle ORM, Supabase as host, row-level security policies, pgvector for embeddings, migrations, and a seed script. Other packages will depend on `@sparkflow/db` to read/write every entity in the platform.

## Acceptance criteria
1. `pnpm --filter @sparkflow/db db:generate` produces migration SQL from the schema.
2. `pnpm --filter @sparkflow/db db:push` applies migrations to a Supabase project successfully.
3. `pnpm --filter @sparkflow/db db:seed` inserts at least one org, one user, one conversation with two messages.
4. Root `pnpm typecheck` stays green.
5. All 19 tables listed below exist with correct FKs, indexes, RLS policies.
6. Extensions enabled: `pgcrypto`, `vector`, `pg_trgm`.

## Tables required (19)
From the master plan:
`users`, `organizations`, `memberships`, `conversations`, `messages`, `tasks`, `task_steps`, `files`, `file_chunks` (with `embedding vector(1536)`), `agents`, `workflows`, `workflow_runs`, `subscriptions`, `usage_records`, `memories` (with embedding), `api_keys` (hashed), `audit_logs`, `feature_flags`, `shared_links`.

Every tenant-scoped table needs `organization_id` + RLS policy `organization_id = auth.jwt() ->> 'org_id'`.

## Tech choices (non-negotiable)
- `drizzle-orm` + `drizzle-kit` + `postgres` driver (not `pg`).
- Supabase for hosting. Use the service-role connection string for migrations; the pooler URL for runtime.
- pgvector via `drizzle-orm/pg-core` `vector` column helper.
- Timestamps: `created_at`, `updated_at`, both `timestamptz` with `defaultNow()`. Soft deletes via `deleted_at` where appropriate.
- Ids: `uuid` primary keys with `gen_random_uuid()`.

## Files to create
- `packages/db/package.json` — add `drizzle-orm@^0.36`, `drizzle-kit@^0.28`, `postgres@^3.4`.
- `packages/db/drizzle.config.ts`
- `packages/db/src/schema/{users,organizations,memberships,conversations,messages,tasks,files,agents,workflows,subscriptions,usage,memories,api-keys,audit,flags,shared-links}.ts`
- `packages/db/src/schema/index.ts` — barrel re-export.
- `packages/db/src/client.ts` — exports `createDb(connectionString)` returning a Drizzle client.
- `packages/db/src/seed.ts` — idempotent seed.
- `packages/db/migrations/0000_initial.sql` (generated).
- `packages/db/README.md` — how to set up a Supabase project + env vars.

## Env vars to add (already registered in root turbo.json)
- `DATABASE_URL` (pooler)
- `DIRECT_URL` (direct, for migrations)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## RLS policy pattern
```sql
alter table <t> enable row level security;
create policy "tenant_isolation" on <t>
  using (organization_id = (auth.jwt() ->> 'org_id')::uuid);
```
For `users` and `audit_logs`, craft specialized policies.

## Do NOT
- Do not introduce Prisma.
- Do not use `pg` directly. Stay on `postgres-js`.
- Do not skip RLS.
- Do not commit real credentials. Update `.env.example` only.

## Verification commands to run before finishing
```bash
cd ~/sparkflow
pnpm --filter @sparkflow/db db:generate
pnpm --filter @sparkflow/db db:push   # against a throwaway Supabase project
pnpm --filter @sparkflow/db db:seed
pnpm typecheck
git add -A && git commit -m "WP-A2: database schema + Drizzle + RLS + seed"
```
