# SparkFlow — production deploy runbook

End-to-end runbook to take SparkFlow from a clean Vercel + Supabase account to
a live production deployment at `https://app.sparkflow.io`. Follow top-to-bottom
the first time; subsequent deploys are just steps 4–6.

Target stack:

- **Web**: Next.js 15 (App Router) on Vercel, region `nrt1` (Tokyo).
- **DB/Auth**: Supabase, region `ap-northeast-1` (Tokyo).
- **Email**: Resend (transactional) via Supabase SMTP.
- **Payments**: Stripe (live mode).
- **Observability**: Sentry + PostHog + BetterStack.
- **Jobs**: Inngest Cloud (Production environment).

---

## 1. Prerequisites

- [ ] **Vercel** account with a **Pro** or **Team** plan (required for 60s+
      function duration, region pinning, password protection).
- [ ] **Supabase** account; create a new project in `ap-northeast-1` (Tokyo)
      on the **Pro** plan (required for daily backups + PITR).
- [ ] **Stripe** account, live mode enabled, tax registration complete for the
      jurisdictions you'll charge in.
- [ ] **DNS** control over `sparkflow.io` (Cloudflare, Route 53, etc.), able to
      add a CNAME at `app.sparkflow.io` and TXT records for email.
- [ ] **Resend** account with `mail.sparkflow.io` domain verified (SPF, DKIM,
      Return-Path CNAME).
- [ ] **Google Cloud** project with an OAuth 2.0 Web client (for Google sign-in).
- [ ] **Sentry**, **PostHog**, **Inngest** accounts with production projects
      created (separate from dev).
- [ ] Local toolchain: Node 20 (`.nvmrc`), pnpm 9+, `vercel`, `supabase`,
      `psql` 16, `aws` CLI.
- [ ] This repo cloned, `main` branch checked out, working tree clean.

---

## 2. Provision the database

### 2.1 Create the project

Dashboard → **New project**:

| Field       | Value                                |
| ----------- | ------------------------------------ |
| Name        | `sparkflow-prod`                     |
| Region      | `Northeast Asia (Tokyo) ap-northeast-1` |
| Plan        | Pro (min)                            |
| DB password | Generated, save in 1Password         |

Wait ~2 minutes for provisioning.

### 2.2 Enable extensions

Dashboard → **SQL editor** → run the block in
`infra/supabase-prod/migrations.md §1` (pgcrypto, uuid-ossp, vector, pg_trgm,
pg_stat_statements).

### 2.3 Push schema

```bash
export DATABASE_URL="$SUPABASE_DB_URL_DIRECT"   # direct, port 5432
pnpm --filter @sparkflow/db db:push -- --strict
```

Inspect every statement; type `y` only after the safety checklist in
`migrations.md §2` passes.

### 2.4 Apply RLS

```bash
psql "$SUPABASE_DB_URL_DIRECT" -v ON_ERROR_STOP=1 -f infra/supabase-prod/rls.sql
```

### 2.5 Create pgvector indexes

Run the `create index concurrently ...` statements from
`migrations.md §4`. One statement at a time (cannot be in a transaction).

### 2.6 Verify

See `migrations.md §5` — schema, RLS-enabled tables, vector indexes.

---

## 3. Configure Supabase Auth

Dashboard → **Authentication → URL Configuration**:

| Field                   | Value                                              |
| ----------------------- | -------------------------------------------------- |
| Site URL                | `https://app.sparkflow.io`                         |
| Redirect URLs (allow-list) | `https://app.sparkflow.io/**`<br>`https://*-sparkflow.vercel.app/**` (preview)<br>`http://localhost:3000/**` (dev, optional) |

### 3.1 SMTP (Resend)

Dashboard → **Authentication → Email → SMTP Settings**:

| Field        | Value                        |
| ------------ | ---------------------------- |
| Host         | `smtp.resend.com`            |
| Port         | `465`                        |
| User         | `resend`                     |
| Password     | Your Resend API key (`re_...`) |
| Sender email | `no-reply@mail.sparkflow.io` |
| Sender name  | `SparkFlow`                  |

Send a test email from the dashboard. If it doesn't arrive, check the
Resend → Emails log for a delivery failure before retrying.

Customize the email templates (confirmation, magic link, recovery) under
**Authentication → Email Templates** — the defaults leak "supabase.io" links.

### 3.2 Google OAuth

Google Cloud Console → **APIs & Services → Credentials → Create OAuth client
ID → Web application**:

| Field                | Value                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Authorized JS origin | `https://app.sparkflow.io`                                           |
| Authorized redirect  | `https://<PROJECT_REF>.supabase.co/auth/v1/callback`                 |

Copy the client ID + secret into Supabase → **Authentication → Providers →
Google** (enable + paste + save).

Test the flow in an incognito window before moving on.

---

## 4. Push env vars to Vercel

```bash
# First time only
vercel login
cd /path/to/sparkflow
vercel link --project sparkflow-web

# Populate local .env.production from the template
cp infra/vercel/env.example .env.production
# ...fill in every value (do NOT commit this file — it's in .gitignore)

# Dry-run to confirm
DRY_RUN=1 ENV_FILE=.env.production ./infra/vercel/secrets.sh

# Push for real (production scope)
VERCEL_ENV=production ENV_FILE=.env.production ./infra/vercel/secrets.sh

# And preview scope (optional, same values or separate preview project)
VERCEL_ENV=preview ENV_FILE=.env.preview ./infra/vercel/secrets.sh

# Verify
vercel env ls production
```

---

## 5. First deploy

```bash
# Build once locally to shake out type errors outside of Vercel's timeout.
pnpm install --frozen-lockfile
pnpm turbo run build --filter=@sparkflow/web

# Deploy to production
vercel --prod
```

Watch the build log. Expected duration: ~4–7 min for a cold build.

The deploy is **live** the moment the build finishes — but at this point it
only has a `*.vercel.app` URL; custom DNS is step 7.

---

## 6. Post-deploy smoke tests

Against the `.vercel.app` URL (before DNS flip) or against
`https://app.sparkflow.io` once DNS has propagated:

```bash
BASE="https://app.sparkflow.io"

# 6.1 Health
curl -fsS "$BASE/api/health" | jq .
# expected: {"status":"ok","db":"ok","version":"<sha>"}

# 6.2 Chat (unauthenticated should be 401, not 500)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
# expected: 401

# 6.3 Chat (authenticated) — supply a real user JWT from the app
curl -sS -N -X POST "$BASE/api/chat" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ping"}]}' | head -c 500
# expected: SSE stream, first event within ~2s

# 6.4 Sheets generate
curl -sS -X POST "$BASE/api/sheets/generate" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"monthly budget for a team of 5"}' | jq '.sheetId'
# expected: a uuid; the sheet opens at $BASE/sheets/<uuid>
```

Also check:

- [ ] Sentry → Issues — no new errors from the smoke tests.
- [ ] PostHog → Live events — `$pageview` and `chat.completed` firing.
- [ ] Supabase → Logs → Postgres — no query errors.
- [ ] Stripe → Developers → Webhooks — `/api/stripe/webhook` marked "healthy".

---

## 7. DNS cutover

At your DNS provider, for `app.sparkflow.io`:

```
Type   Name   Value                       TTL
CNAME  app    cname.vercel-dns.com.       300
```

Then in Vercel:

1. **Project → Settings → Domains → Add** → `app.sparkflow.io`.
2. Vercel verifies the CNAME and provisions a Let's Encrypt cert (~2 min).
3. Mark it as the **Production** domain (star icon).
4. Redirect the apex `sparkflow.io` → `app.sparkflow.io` via a second Vercel
   project or a DNS-level redirect (Cloudflare Page Rules).

Confirm HTTPS: `curl -vI https://app.sparkflow.io 2>&1 | grep -E 'HTTP|strict'`.
You should see `HTTP/2 200` and `strict-transport-security: max-age=63072000; includeSubDomains; preload`.

---

## 8. Monitoring

### 8.1 BetterStack synthetic checks

BetterStack → **Uptime → New monitor** (create four):

| Name                  | URL                                      | Method | Expected           | Interval |
| --------------------- | ---------------------------------------- | ------ | ------------------ | -------- |
| sparkflow-home        | `https://app.sparkflow.io/`              | GET    | 200, contains "SparkFlow" | 30s      |
| sparkflow-health      | `https://app.sparkflow.io/api/health`    | GET    | 200, contains `"status":"ok"` | 30s      |
| sparkflow-chat-401    | `https://app.sparkflow.io/api/chat` (POST, empty body) | POST   | 401                | 60s      |
| sparkflow-sign-in     | `https://app.sparkflow.io/sign-in`       | GET    | 200                | 60s      |

Route incidents to PagerDuty (on-call) + `#alerts` Slack channel. SLO: 99.9%
over 30 days.

### 8.2 Sentry & PostHog

- Sentry release tracking is wired via `SENTRY_AUTH_TOKEN` at build time —
  every deploy creates a release and uploads source maps. Verify at
  Sentry → Releases.
- PostHog `feature_flags.json` should be loaded from PostHog Cloud at runtime;
  verify in the browser devtools → Network → `/decide`.

### 8.3 Supabase metrics

Dashboard → **Reports** → set alerts on: CPU > 80% for 10m, disk > 80%,
`pg_stat_statements` p95 latency > 500ms.

---

## 9. Rollback

### Instant rollback (recommended for code-only regressions)

```bash
vercel rollback
# Interactive: pick the previous "Ready" deploy.
#
# Or non-interactive:
vercel rollback <deployment-url>
```

Traffic switches within seconds. The alias `app.sparkflow.io` now points to
the previous deploy; no rebuild needed.

### Roll back a schema migration

Code and DB drift independently. If a migration broke the DB, rolling back
the Vercel deploy is **not enough**:

1. Roll back the app: `vercel rollback` (so the old code doesn't keep writing
   data in the new shape).
2. Restore the DB from the pre-migration backup — see
   `infra/supabase-prod/backup.md §1` (PITR to 1 minute before the push).
3. If only an additive migration (new nullable column, new table), you can
   instead write a corrective `alter table ... drop column ...` and
   re-deploy. Never run destructive SQL without a backup.

### Rotate a compromised key

See `infra/supabase-prod/secrets.md`. Rotation is its own runbook because it
will sign out every user.

---

## 10. Troubleshooting

### Build: "Module not found: Can't resolve 'fs'"

Something server-only got imported into a client component. Search for
`"use client"` at the top of the offending file — if it's there, the file
must not import from `@supabase/supabase-js` (node-only helpers) or from
`packages/db`. Use the `@supabase/ssr` `createBrowserClient` instead.

### Runtime: "cookies() was called outside a request scope"

Next.js 15 made `cookies()` async. Every server component or route handler
that builds a Supabase client must `await` the helper:

```ts
// correct (Next 15)
const supabase = await createServerClient();
```

Any stale code still doing `const supabase = createServerClient()` without
`await` will crash only on the Vercel edge, not locally with `next dev` —
search `git grep "createServerClient()"` after upgrading.

### Runtime: "Auth session missing" on every request

The SSR cookie is being set on the wrong domain. Check that
`NEXT_PUBLIC_APP_URL` matches the **exact** host including protocol, and that
Supabase → Auth → URL config lists that host under Redirect URLs. A mismatch
causes the browser to drop the set-cookie header silently.

### Runtime: "invalid JWT: signature is invalid"

The service-role key in Vercel was signed with a different JWT secret than the
project currently uses. Someone rotated the JWT secret without updating env
vars. Run `./infra/vercel/secrets.sh` again with a fresh `.env.production`.

### Build: "Type error in generated supabase types"

`packages/db` regenerates Supabase types at build time. If the schema in prod
drifted from what's committed, types will fail to compile. Regenerate locally:

```bash
supabase gen types typescript --linked > packages/db/src/types/supabase.ts
```

Commit and redeploy.

### Edge: "Too many connections" from Postgres

You're connecting from a serverless function to the **direct** 5432 port
instead of the **pooler** 6543. In Vercel envs, `SUPABASE_DB_URL` must end in
`...pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`.
Only migrations (from your laptop) use port 5432.

### Function: "Execution timed out after 10s"

You forgot to bump `maxDuration` for that route in `vercel.json`. Chat and
sheet generation are pre-configured for 300s. Any new long-running route
needs a matching entry under `functions`.

### Stripe webhook: "400 No signatures found matching the expected signature"

The webhook endpoint in Stripe was created against the test-mode secret but
you're verifying with the live-mode secret (or vice versa). Recreate the
webhook in live mode, copy the new `whsec_...`, update
`STRIPE_WEBHOOK_SECRET` on Vercel, redeploy.

---

## Appendix: file map

- `vercel.json` — edge build + headers + function timeouts.
- `infra/vercel/project.json` — Vercel project template (region, framework).
- `infra/vercel/env.example` — every env var with source + secret annotation.
- `infra/vercel/secrets.sh` — push envs via `vercel env add`.
- `infra/supabase-prod/migrations.md` — schema push, RLS, pgvector indexes.
- `infra/supabase-prod/backup.md` — managed + off-platform backups.
- `infra/supabase-prod/secrets.md` — rotate the service role key.
- `docs/DEPLOY.md` — this file.
