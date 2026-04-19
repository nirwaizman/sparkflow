/**
 * POST /api/v1/agents/run — public agent execution.
 *
 * Forwards to the internal ad-hoc run endpoint.
 */
import { type NextRequest } from "next/server";
import { guardPublicRequest, proxyToInternal } from "@/lib/public-api/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await guardPublicRequest(req);
  if (!guard.ok) return guard.response;
  return proxyToInternal(req, "/api/agents/run-adhoc", guard.caller);
}
