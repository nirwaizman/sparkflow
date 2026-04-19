/**
 * SCIM 2.0 /Users/:id item handlers.
 *
 *   GET    → fetch single user
 *   PATCH  → partial update (active, displayName, emails…)
 *   PUT    → full replace (treated identically to PATCH here)
 *   DELETE → remove membership in the caller's org
 */
import { NextResponse, type NextRequest } from "next/server";
import { handleScimRequest } from "@sparkflow/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dispatch(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  method: "GET" | "PATCH" | "PUT" | "DELETE",
): Promise<Response> {
  const { id } = await ctx.params;
  const body = method === "PATCH" || method === "PUT" ? await safeJson(req) : undefined;
  const res = await handleScimRequest({
    method,
    path: `/Users/${id}`,
    body,
    bearer: req.headers.get("authorization"),
    query: Object.fromEntries(req.nextUrl.searchParams.entries()),
  });
  return NextResponse.json(res.body, { status: res.status, headers: res.headers });
}

async function safeJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return dispatch(req, ctx, "GET");
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return dispatch(req, ctx, "PATCH");
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return dispatch(req, ctx, "PUT");
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return dispatch(req, ctx, "DELETE");
}
