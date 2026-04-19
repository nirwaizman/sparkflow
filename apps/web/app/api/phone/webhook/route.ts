/**
 * POST /api/phone/webhook
 *
 * Vapi webhook receiver. Public path (listed in middleware's
 * PUBLIC_EXACT) so Vapi can hit it without a session cookie.
 *
 * Auth model: optional shared secret `VAPI_WEBHOOK_SECRET`. Vapi sends
 * it in the `x-vapi-secret` header. If the env var is set, we require
 * an exact match (constant-time compared); if unset, we accept all
 * requests (dev / local testing mode) but log a warning.
 *
 * Handler is deliberately minimal: we acknowledge the event and echo
 * the type back. Downstream consumers (DB persistence, analytics) plug
 * in via TODOs below — see the section at the bottom of the file.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-vapi-secret") ?? "";
    if (!constantTimeEquals(secret, provided)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Vapi's event envelopes look like `{ message: { type, call, … } }`.
  // We extract the type for logging and structured responses but don't
  // strictly validate — Vapi tweaks this shape occasionally.
  const message =
    body && typeof body === "object" && "message" in body
      ? (body as { message: unknown }).message
      : body;
  const eventType =
    message && typeof message === "object" && "type" in message
      ? String((message as { type: unknown }).type)
      : "unknown";

  // TODO: persist call events (status changes, transcripts, recordings)
  // to the DB so /calls/[id] can read from our own store instead of
  // round-tripping to Vapi every poll. Blocked on schema design.
  //
  // TODO: fan out end-of-call events to any downstream workflows that
  // were waiting for this call to complete.

  return NextResponse.json({ ok: true, eventType });
}
