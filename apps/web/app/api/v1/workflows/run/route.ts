/**
 * POST /api/v1/workflows/run — public workflow execution.
 *
 * Proxies to the internal `/api/workflows/:id/run` handler by
 * rewriting the path based on the request body's `workflowId`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardPublicRequest, proxyToInternal } from "@/lib/public-api/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await guardPublicRequest(req);
  if (!guard.ok) return guard.response;

  let body: { workflowId?: string } | null = null;
  try {
    body = (await req.clone().json()) as { workflowId?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const workflowId = body?.workflowId;
  if (!workflowId || typeof workflowId !== "string") {
    return NextResponse.json({ error: "missing_workflowId" }, { status: 400 });
  }

  return proxyToInternal(
    req,
    `/api/workflows/${encodeURIComponent(workflowId)}/run`,
    guard.caller,
  );
}
