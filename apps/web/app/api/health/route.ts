/**
 * GET /api/health
 *
 * Returns:
 *   - Basic env/provider fingerprint (same as before).
 *   - Upstream dependency health (`runHealthChecks`): DB, Redis,
 *     Langfuse, OpenAI.
 *   - Rolling SLO snapshot (`snapshotSlo`) — p50/p95/p99 + error rate
 *     per monitored component from the in-memory sliding window.
 *
 * Consumed by:
 *   - BetterStack synthetic monitor (see `infra/monitoring/betterstack.yaml`).
 *   - The internal /super status page.
 *   - Grafana Cloud scrape job (see `infra/monitoring/grafana-cloud.yaml`).
 *
 * The response status code is 503 whenever any configured dependency is
 * `down`, so BetterStack can page purely on HTTP status and doesn't have
 * to parse the body.
 */
import { NextResponse } from "next/server";
import { runHealthChecks, snapshotSlo } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await runHealthChecks();
  const slo = snapshotSlo();

  const payload = {
    ok: health.ok,
    app: process.env.NEXT_PUBLIC_APP_NAME ?? "SparkFlow",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      tavily: Boolean(process.env.TAVILY_API_KEY),
      serpapi: Boolean(process.env.SERPAPI_API_KEY),
    },
    searchProvider: process.env.SEARCH_PROVIDER ?? "demo",
    health,
    slo,
  };

  return NextResponse.json(payload, {
    status: health.ok ? 200 : 503,
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
