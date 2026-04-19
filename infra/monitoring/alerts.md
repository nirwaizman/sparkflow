# SparkFlow alert rules

This document is the source of truth for what pages whom, and why.
Alerts are provisioned in Grafana Cloud's alerting engine and, for the
HTTP-probe rules, mirrored in BetterStack (see `betterstack.yaml`).

All thresholds below assume the monthly service objective of
**99.9% availability** (~43m 49s of allowed downtime/month).

---

## P1 — page primary on-call (PagerDuty `sparkflow-primary`)

### 1. Fast-burn SLO alert

- **Name:** `slo-burn-fast`
- **Expression (PromQL):**
  ```promql
  (
    sum(rate(sparkflow_http_request_errors_total{env="production"}[1h]))
    /
    sum(rate(sparkflow_http_request_duration_ms_count{env="production"}[1h]))
  ) > (14.4 * (1 - 0.999))
  AND
  (
    sum(rate(sparkflow_http_request_errors_total{env="production"}[5m]))
    /
    sum(rate(sparkflow_http_request_duration_ms_count{env="production"}[5m]))
  ) > (14.4 * (1 - 0.999))
  ```
- **For:** 2m
- **Why:** Google SRE multi-window burn rate. Firing means we will
  consume the entire monthly error budget in <2 days at the current
  rate — a real, ongoing incident.

### 2. Slow-burn SLO alert

- **Name:** `slo-burn-slow`
- **Expression:**
  ```promql
  (
    sum(rate(sparkflow_http_request_errors_total{env="production"}[6h]))
    /
    sum(rate(sparkflow_http_request_duration_ms_count{env="production"}[6h]))
  ) > (6 * (1 - 0.999))
  AND
  (
    sum(rate(sparkflow_http_request_errors_total{env="production"}[30m]))
    /
    sum(rate(sparkflow_http_request_duration_ms_count{env="production"}[30m]))
  ) > (6 * (1 - 0.999))
  ```
- **For:** 15m
- **Why:** Catches sustained low-grade errors that the fast-burn rule
  would miss. Budget exhausted in ~5 days at current rate.

### 3. Stripe webhook failures

- **Name:** `stripe-webhook-failures`
- **Expression:**
  ```promql
  sum(rate(sparkflow_http_request_errors_total{
    route="api.billing.webhooks.stripe", env="production"
  }[10m])) > 0.1
  ```
- **For:** 5m
- **Why:** A silently failing Stripe webhook means subscription state
  drift — by the time a customer notices, refund/support load spikes.
- **Runbook:** `runbook.md#stripe-webhook-failures`

### 4. Dependency down

- **Name:** `dependency-down`
- **Expression:**
  ```promql
  min by (component) (
    sparkflow_dependency_up{component=~"database|redis", env="production"}
  ) == 0
  ```
- **For:** 3m
- **Why:** DB or Redis outage — most routes will fail. Page even if we
  don't see error-rate signal yet, because graceful degradation paths
  may be masking user-visible failures.

### 5. Health endpoint failing

- **Name:** `health-endpoint-failing`
- **Source:** BetterStack monitor `web-health` (see `betterstack.yaml`).
- **Why:** The probe follows the same code path as real users.
  BetterStack's multi-region confirmation eliminates false positives.

---

## P2 — Slack-only (#ops-alerts)

### 6. Auth error spike

- **Name:** `auth-error-spike`
- **Expression:**
  ```promql
  sum(rate(sparkflow_auth_errors_total{env="production"}[5m])) > 5
  AND
  sum(rate(sparkflow_auth_errors_total{env="production"}[5m]))
  /
  clamp_min(sum(rate(sparkflow_auth_attempts_total{env="production"}[5m])), 1)
  > 0.1
  ```
- **For:** 10m
- **Why:** Either a credential-stuffing attack or a broken identity
  provider. Both deserve human eyes; neither is always page-worthy.

### 7. LLM cost runaway

- **Name:** `llm-cost-runaway`
- **Expression:**
  ```promql
  sum(rate(sparkflow_llm_cost_usd_total{env="production"}[1h])) * 3600 > 500
  ```
- **For:** 15m
- **Why:** Sustained >$500/h in provider spend usually indicates a
  runaway loop or prompt injection abuse. Check `runbook.md#cost-runaway`.

### 8. Latency regression

- **Name:** `latency-p95-regression`
- **Expression:**
  ```promql
  histogram_quantile(0.95,
    sum by (le, route) (
      rate(sparkflow_http_request_duration_ms_bucket{
        route=~"api\\..*", env="production"
      }[15m])
    )
  ) > 5000
  ```
- **For:** 15m
- **Why:** No errors but users are waiting. Often points at a
  saturated upstream provider or a noisy-neighbor Vercel region.

---

## Suppression rules

- Alerts `slo-burn-fast` and `slo-burn-slow` suppress each other — the
  fast one wins when both fire.
- Between 22:00 and 07:00 local, P2 Slack alerts are batched into a
  single morning digest unless they persist for >30m.
