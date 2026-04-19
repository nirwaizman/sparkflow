/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 document for the public API.
 *
 * Publicly readable (no auth) so docs generators + API-explorer tools
 * can discover endpoints. The spec itself describes each endpoint's
 * auth requirements.
 */
import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@sparkflow/public-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const serverUrl =
    process.env.PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://api.sparkflow.ai";
  const doc = buildOpenApiSpec({ serverUrl });
  return NextResponse.json(doc, {
    headers: { "cache-control": "public, max-age=60" },
  });
}
