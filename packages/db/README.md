# @sparkflow/db

Drizzle ORM schema + client for SparkFlow. Targets Supabase Postgres with
`pgvector`, `pgcrypto`, and `pg_trgm`.

## Setup

### 1. Create a Supabase project

1. Go to https://supabase.com and create a new project (any region; pick
   one close to your users — latency matters for RAG).
2. In the project dashboard copy these from **Project Settings -> API**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (public)
   - `SUPABASE_SERVICE_ROLE_KEY` (keep secret — server-only)
3. From **Project Settings -> Database** copy the two connection strings:
   - **Pooler** (`Transaction` mode, port 6543) -> `DATABASE_URL`
   - **Direct** (port 5432) -> `DIRECT_URL`

### 2. Environment variables

Create `.env` (not committed) at the repo root or in `packages/db/.env`:

```
DATABASE_URL=postgresql://postgres.xxxx:PASS@aws-0-...pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.xxxx:PASS@aws-0-...supabase.com:5432/postgres
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Use the **direct** URL for migrations (drizzle-kit) and the **pooler** URL
for the app's runtime queries. The drizzle config prefers `DIRECT_URL` when
present.

### 3. Enable extensions

Run the SQL in `src/schema/_extensions.ts` (`ENABLE_EXTENSIONS_SQL`) once in
the Supabase SQL editor, or:

```bash
psql "$DIRECT_URL" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto; \
                        CREATE EXTENSION IF NOT EXISTS vector; \
                        CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### 4. Create tables and apply RLS

```bash
pnpm -C packages/db db:push     # create tables from src/schema/*.ts
psql "$DIRECT_URL" -f packages/db/migrations/rls.sql   # enable RLS + policies
```

> **Important:** `migrations/rls.sql` is hand-written and must be applied
> manually after `db:push`. Re-apply it whenever you add a new
> tenant-scoped table. The file is idempotent.

### 5. Seed

```bash
pnpm -C packages/db db:seed
```

## Commands

| Command                              | What it does                                                         |
| ------------------------------------ | -------------------------------------------------------------------- |
| `pnpm -C packages/db db:generate`    | Generate a new SQL migration from current `src/schema/*.ts`.         |
| `pnpm -C packages/db db:push`        | Push current schema to the DB (skips generating migration files).    |
| `pnpm -C packages/db db:studio`      | Launch Drizzle Studio for ad-hoc queries.                            |
| `pnpm -C packages/db db:seed`        | Run idempotent dev seed (org, user, conversation, messages).         |
| `pnpm -C packages/db typecheck`      | `tsc --noEmit`.                                                      |

## Usage from other packages

```ts
import { getDb, users, conversations, type Conversation } from "@sparkflow/db";

const db = getDb();
const rows = await db.select().from(conversations).limit(10);
```

## Layout

```
packages/db/
  drizzle.config.ts
  migrations/            # generated SQL + rls.sql (hand-written)
  src/
    client.ts            # createDb(), getDb(), closeDb()
    seed.ts              # pnpm db:seed entrypoint
    index.ts             # barrel: re-exports client + schema
    schema/
      _extensions.ts     # CREATE EXTENSION ... + post-migration ANN indexes
      organizations.ts
      users.ts
      memberships.ts
      conversations.ts
      messages.ts
      tasks.ts
      taskSteps.ts
      files.ts
      fileChunks.ts
      agents.ts
      workflows.ts
      workflowRuns.ts
      subscriptions.ts
      usageRecords.ts
      memories.ts
      apiKeys.ts
      auditLogs.ts
      featureFlags.ts
      sharedLinks.ts
      index.ts
```
