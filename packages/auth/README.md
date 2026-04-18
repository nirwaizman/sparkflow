# @sparkflow/auth

Supabase-backed auth, org membership, and RBAC for SparkFlow.

## What it provides

- `getSession()` / `requireSession()` — resolve the current user + active org.
- `requireRole(session, minRole)` — enforce `owner > admin > member > viewer`.
- `createSupabaseServerClient()` / `createSupabaseBrowserClient()` — SSR and browser Supabase clients.
- `createInvite()` / `acceptInvite()` — organization invitations (in-memory stub; see TODO below).
- `logAudit()` — append-only writes to `audit_logs`.

## Enable

1. Create a Supabase project. In **Authentication → Providers**, enable **Email (Magic Link)** and optionally **Google**.
2. In **Authentication → URL Configuration**, add your app origin + `/auth/callback`.
3. Set the following env vars (already present in `apps/web/.env.example`):
   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   # browser-exposed variants (optional — falls back to SUPABASE_URL/ANON_KEY)
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. Apply Drizzle migrations (`pnpm -C packages/db db:push`) so `users`, `organizations`, `memberships`, `audit_logs` exist.
5. Start the app (`pnpm -C apps/web dev`), visit `/login`, request a magic link.
6. First sign-in goes through `/auth/callback`, which creates a personal org + owner membership if none exists.

## Role precedence

| Role   | Rank |
|--------|------|
| owner  | 3    |
| admin  | 2    |
| member | 1    |
| viewer | 0    |

`requireRole(session, "admin")` passes for owners and admins only.

## TODOs

- **Invites table**: `createInvite` / `acceptInvite` currently back their state with an in-memory `Map`. A follow-up PR should add an `invites` table to `@sparkflow/db` (columns: `id`, `organization_id`, `email`, `role`, `token`, `invited_by`, `expires_at`, `accepted_at`, `created_at`) and swap the Map for Drizzle calls. The public API won't change.
- **Rate limiter (WP-A5)**: `apps/web/middleware.ts` ships a best-effort in-memory token-bucket keyed by IP. Replace with Upstash Redis once `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are wired.
