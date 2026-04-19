/**
 * GET /api/integrations/status
 *
 * Lightweight status endpoint that the `/integrations` page can poll
 * to know, per provider, whether it is:
 *   - `not_configured` — missing env credentials on the server
 *   - `not_connected`  — configured, but this user has not connected
 *   - `connected`      — a valid token is stored
 *   - `expired`        — a token is stored but past its expires_at
 *
 * Keeps the page code simple and avoids leaking token bytes to the
 * client.
 *
 * TODO(WP-integrations): read per-provider status from the real
 * `integrations` table instead of the in-memory store.
 */
import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@sparkflow/auth";
import { getGoogleToken, isGoogleConfigured } from "../_store";

export const runtime = "nodejs";

type ProviderStatus = "not_configured" | "not_connected" | "connected" | "expired";

function googleStatus(userId: string): {
  status: ProviderStatus;
  scopes?: string;
  expiresAt?: number;
} {
  if (!isGoogleConfigured()) return { status: "not_configured" };
  const token = getGoogleToken(userId);
  if (!token) return { status: "not_connected" };
  if (token.expires_at <= Date.now()) {
    return { status: "expired", scopes: token.scopes, expiresAt: token.expires_at };
  }
  return {
    status: "connected",
    scopes: token.scopes,
    expiresAt: token.expires_at,
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    const google = googleStatus(session.user.id);
    return NextResponse.json({
      providers: {
        // Drive + Gmail share the same Google token, so they are
        // intentionally reported with the same status.
        "google-drive": google,
        gmail: google,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
