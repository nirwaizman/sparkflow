/**
 * GET /api/auth/me
 *
 * Returns the current session as JSON for fast client-side checks
 * (e.g. "am I still logged in?"). Returns 401 when unauthenticated.
 *
 * Keep the payload minimal — it's called opportunistically by the UI.
 */
import { NextResponse } from "next/server";
import { getSession } from "@sparkflow/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ session });
}
