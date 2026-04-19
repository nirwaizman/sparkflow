/**
 * POST /api/v1/docs/generate — public document generation.
 *
 * API-key authenticated + per-key rate limited. Proxies to the
 * internal `/api/docs/generate` handler.
 */
import { type NextRequest } from "next/server";
import { guardPublicRequest, proxyToInternal } from "@/lib/public-api/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await guardPublicRequest(req);
  if (!guard.ok) return guard.response;
  return proxyToInternal(req, "/api/docs/generate", guard.caller);
}
