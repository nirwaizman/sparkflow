/**
 * POST /api/phone/call
 *
 * Body: `{ toNumber, script, voice? }`.
 * Starts an outbound Vapi call. If Vapi isn't configured, responds with
 * a structured 503 so the UI can render a "phone not configured"
 * message instead of treating this as an error.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";
import { isConfigured, startCall } from "@/lib/phone/vapi";

export const runtime = "nodejs";

const requestSchema = z.object({
  // Loose E.164 validation — Vapi does stricter checks server-side.
  toNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/u, "must be E.164 (e.g. +15551234567)"),
  script: z.string().min(1).max(8_000),
  voice: z.string().max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireSession();

    if (!isConfigured()) {
      return NextResponse.json(
        { error: "phone not configured" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const call = await startCall(parsed);
    return NextResponse.json({ call });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
