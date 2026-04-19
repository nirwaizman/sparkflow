/**
 * SCIM 2.0 /Groups collection. See /Users/route.ts for notes — the
 * shape is identical, just the resource name and the (in-memory) store
 * differ.
 */
import { NextResponse, type NextRequest } from "next/server";
import { handleScimRequest } from "@sparkflow/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dispatch(
  req: NextRequest,
  method: "GET" | "POST",
): Promise<Response> {
  const body = method === "POST" ? await safeJson(req) : undefined;
  const res = await handleScimRequest({
    method,
    path: "/Groups",
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

export async function GET(req: NextRequest) {
  return dispatch(req, "GET");
}
export async function POST(req: NextRequest) {
  return dispatch(req, "POST");
}
