/**
 * GET /api/phone/calls/[id]
 *
 * Returns the current status + transcript for a Vapi call. Thin
 * passthrough to the wrapper.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { isConfigured, getCall } from "@/lib/phone/vapi";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    if (!isConfigured()) {
      return NextResponse.json(
        { error: "phone not configured" },
        { status: 503 },
      );
    }
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    const call = await getCall(id);
    return NextResponse.json({ call });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
