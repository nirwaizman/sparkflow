# Supabase production — secret rotation

The service role key bypasses RLS. Treat it with the same care as the
Postgres superuser password: never ship it to the browser, never paste it
into a chat, rotate on any suspected exposure and at least every 90 days.

## What's in scope

| Secret                       | Where it's used                                                | Rotate on exposure? |
| ---------------------------- | -------------------------------------------------------------- | ------------------- |
| `service_role` JWT           | Server-side admin calls (inngest handlers, cron, migrations)   | Yes, always         |
| `anon` JWT                   | Public client                                                  | Yes, but plan it    |
| JWT signing secret           | Used to sign both keys above                                   | Yes — **invalidates all existing user sessions** |
| Database password (`postgres`) | Direct DB connections (`pg_dump`, drizzle push, psql)        | Yes                 |

## Rotating the service role key

The service role key is a JWT signed with the project's `JWT secret`. There
are two paths:

### A. Fast rotation — issue a new key with the same signing secret

Use this when you want to invalidate one specific leaked key without
signing-out every user.

1. **Dashboard → Project Settings → API → JWT Settings**.
2. Click **"Generate new JWT secret"** — this is the nuclear option and *will*
   log every user out. Prefer path B below unless the signing secret itself
   leaked.

*(Supabase does not currently support rotating only the service_role JWT while
keeping the signing secret — so "fast rotation" in practice means path B.)*

### B. Full rotation (signing-secret roll)

This is the supported path. Budget ~15 min of partial downtime.

```
Pre-check:
  - Confirm you have a recent backup (backup.md §1).
  - Announce maintenance window in #ops.
  - Make sure you can edit Vercel env vars (admin on the project).

Steps:
  1. Dashboard → Project Settings → API → JWT Settings → "Generate a new JWT secret".
     This immediately:
       • Invalidates every currently issued JWT (users get signed out).
       • Rotates both the `anon` and `service_role` keys.
  2. Copy the new `service_role` and `anon` keys from the API page.
  3. Update Vercel env vars:
       ./infra/vercel/secrets.sh  (edit .env.production first)
     or one-off:
       printf '%s' "<new key>" | vercel env add SUPABASE_SERVICE_ROLE_KEY production
       vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes   # old value
  4. Redeploy: `vercel --prod --force`.
  5. Update any other consumers:
       - GitHub Actions secrets (backup workflow, e2e tests).
       - Inngest cloud env (dashboard.inngest.com → Environments → Production).
       - 1Password vault `sparkflow-prod` entry `supabase-service-role`.
  6. Smoke-test:
       curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
         -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
     Expect HTTP 200 with the OpenAPI JSON.
  7. Post in #ops: "rotation complete, users may need to sign in again".
```

## Rotating the database password

Separate from the JWT secret. Only used by direct Postgres connections.

1. Dashboard → **Database → Settings → Database password → Reset**.
2. Update env vars that reference the password:
   - `SUPABASE_DB_URL` (pooler, in Vercel)
   - `SUPABASE_DB_URL_DIRECT` (direct, in GitHub Actions backup workflow)
3. Redeploy the worker(s) that use direct connections.
4. Rotate any saved connections in local `~/.pgpass` / TablePlus / Postico.

## What to do on suspected leak

1. **Immediately** run path B above — every minute a leaked service role key
   is live, it can read/write any row.
2. Grep the repo + git log for the leaked key:
   `git log -S'<first 8 chars>' --all`.
3. If found in a public commit: treat the project as compromised — review
   Supabase audit logs (Dashboard → Logs → Auth) for anomalous activity and
   page the on-call.
4. If the key was in a client bundle or a browser-visible env var: do the
   rotation and also audit why a service-role value was exposed client-side
   (`NEXT_PUBLIC_*` prefix is the likely culprit).

## Where keys live (canonical list)

- 1Password vault `sparkflow-prod` — source of truth.
- Vercel → Project → Settings → Environment Variables — consumed by the app.
- GitHub → Repo → Settings → Secrets and variables → Actions — consumed by CI.
- Inngest → Environments → Production → Environment Variables.

No secret should live anywhere else. If you find one in a dotfile, a Slack DM,
or a local `.env` that isn't gitignored — rotate it.
