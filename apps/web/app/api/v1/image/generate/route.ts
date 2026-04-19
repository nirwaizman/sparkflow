/**
 * POST /api/v1/image/generate — public image generation.
 *
 * API-key authenticated + per-key rate limited. Proxies to the
 * internal `/api/image/generate` handler.
 */
import { type NextRequest } from "next/server";
import { guardPublicRequest, proxyToInternal } from "@/lib/public-api/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await guardPublicRequest(req);
  if (!guard.ok) return guard.response;
  return proxyToInternal(req, "/api/image/generate", guard.caller);
}
