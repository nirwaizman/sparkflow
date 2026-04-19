# SparkFlow incident response runbook

**Audience:** on-call engineer (primary or secondary).
**Assumed access:** Vercel (prod project), Supabase, Upstash, Stripe
dashboard, Grafana Cloud, BetterStack, PagerDuty, the `#ops-alerts`
Slack channel, and a laptop with the monorepo checked out.

---

## 0. First 5 minutes (any P1 page)

1. **Acknowledge** the PagerDuty page within 2 minutes. Silence the
   page only — do NOT resolve until the incident is actually over.
2. Post in `#ops-incidents`:
   > `incident: <short description>. Acked by <handle>. Investigating.`
   Open a thread. All further updates go in the thread.
3. Declare severity:
   - **SEV-1** — product unusable for most users, data loss risk,
     active security incident. Pull in secondary on-call.
   - **SEV-2** — subset of features broken, or single-region outage.
   - **SEV-3** — degraded but usable, or upstream-provider issue
     with known mitigation.
4. Hit https://sparkflow.io/api/health and eyeball the `components`
   block. The `health.*.status` field narrows the blast radius fast:
   database/redis/langfuse/openai.

---

## 1. Common scenarios

### 1a. `slo-burn-fast` / `slo-burn-slow`

**Symptoms:** error rate elevated across multiple routes; Grafana
"Error rate" panel above the yellow threshold.

1. Open the Grafana dashboard `sparkflow-slo`. Which route is firing?
   - Single route: likely code regression in that handler — check the
     latest Vercel deploy, roll back if the timing matches.
   - All routes: usually upstream. Check `health` and dependency-up
     panels.
2. If a recent deploy correlates, run:
   ```bash
   vercel rollback <deployment-id> --prod
   ```
3. If the cause is an upstream provider, enable degraded mode:
   ```bash
   vercel env add FEATURE_DEGRADED_MODE 1 production
   vercel redeploy --prod
   ```
   This flips chat/image/agent routes to the backup provider matrix
   documented in `docs/ops/degraded-mode.md`.

### 1b. Stripe webhook failures

**Alert:** `stripe-webhook-failures`.

1. Open https://dashboard.stripe.com/webhooks → the `sparkflow-prod`
   endpoint. Look at the last 20 deliveries and the surfaced error.
2. If Stripe is returning 4xx on our side:
   - Most common cause: `STRIPE_WEBHOOK_SECRET` out of sync after a
     Stripe dashboard edit. Fetch a fresh secret, update Vercel env,
     redeploy.
   - Schema mismatch after an event-shape change on Stripe's side —
     check `packages/billing/src/webhook.ts`.
3. Replay failed events from the Stripe dashboard once the fix is
   live. Do NOT replay until the endpoint is healthy — it multiplies
   the backlog.

### 1c. Auth error spike

**Alert:** `auth-error-spike`.

1. In Grafana, group `sparkflow_auth_errors_total` by `reason`:
   - `rate_limited` + geographic clustering → credential stuffing.
     Enable the stricter Upstash rule (`auth:strict` kind) and add the
     offending IPs/ASNs to Vercel's firewall.
   - `provider_unavailable` → Supabase Auth or the SSO IdP is down.
     Check Supabase status, post SEV-3 incident, wait.
2. If credential stuffing is confirmed, open a SEV-2 and notify
   Security via `#sec-incidents`.

### 1d. Dependency down — database

1. Supabase dashboard: any active maintenance? Any CPU/connection
   saturation?
2. If connection saturation, scale the Supabase compute tier and
   drain connections with:
   ```sql
   select pg_terminate_backend(pid)
   from pg_stat_activity
   where state = 'idle'
     and state_change < now() - interval '10 minutes';
   ```
3. If the database is unreachable from Vercel but fine elsewhere,
   open a Vercel ticket — historically a pooler-region network blip.

### 1e. Dependency down — Redis (Upstash)

Rate-limit and session work but the app does NOT hard-fail when
Upstash is down — the rate limiter falls back to an in-memory
bucket per instance (see `packages/security/src/rate-limit.ts`).

1. Downgrade severity to SEV-3 if the error rate is <1%.
2. Monitor for Upstash recovery. No action usually needed.

### 1f. Cost runaway (`llm-cost-runaway`)

1. Open the "LLM token spend" panel in Grafana. Group by `model` and
   `route`. A single runaway usually shows as >5x baseline on one
   route.
2. Temporarily drop the affected route's rate limit:
   ```bash
   vercel env add RATE_LIMIT_CHAT 10 production   # per minute, per user
   vercel redeploy --prod
   ```
3. Check Langfuse traces for the top spenders — filter by
   `user_id`. If one user dominates, suspend their account via the
   /super admin console and open a ticket.

---

## 2. Communication templates

### Initial user-facing status page update

> We're investigating elevated error rates on <surface>. Some users
> may see failed requests. Updates in 15 minutes or when we know more.

### Resolved

> This is resolved. Root cause: <one sentence>. We'll publish a
> post-mortem within 5 business days.

---

## 3. Post-incident

1. Mark the PagerDuty incident resolved AND close the Slack thread
   with "resolved at HH:MM UTC".
2. Open a post-mortem doc (template in `docs/ops/postmortem.md`):
   - Timeline (UTC).
   - Impact (users affected, duration, revenue if any).
   - Root cause (five-whys).
   - What went well / what went poorly.
   - Action items with owners + due dates.
3. Link the post-mortem from the incident channel and from
   `docs/ops/incidents.md`.

---

## 4. Useful commands

```bash
# Tail prod logs (Vercel)
vercel logs sparkflow --prod --follow

# Peek at the current SLO snapshot
curl -s https://sparkflow.io/api/health | jq '.slo.components'

# Reset the in-memory SLO buffer on a single instance (debug only)
curl -X POST https://sparkflow.io/api/dev/__reset-slo \
  -H "x-admin-token: $SPARKFLOW_ADMIN_TOKEN"
```

---

## 5. Escalation contacts

| Role                | Primary        | Secondary      | Hours       |
| ------------------- | -------------- | -------------- | ----------- |
| Platform on-call    | PagerDuty      | PagerDuty      | 24/7        |
| Security            | #sec-incidents | sec-oncall     | 24/7        |
| Billing / Stripe    | #ops-alerts    | finance-oncall | business    |
| Supabase support    | dashboard tix  | email          | per contract |
| OpenAI / Anthropic  | support portal | —              | business    |
