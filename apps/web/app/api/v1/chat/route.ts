/**
 * POST /api/v1/chat — public chat completions.
 *
 * Authenticates with an API key, rate-limits per key, and proxies to
 * the internal `/api/chat` handler. Response is forwarded verbatim.
 */
import { type NextRequest } from "next/server";
import { guardPublicRequest, proxyToInternal } from "@/lib/public-api/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await guardPublicRequest(req);
  if (!guard.ok) return guard.response;
  return proxyToInternal(req, "/api/chat", guard.caller);
}
