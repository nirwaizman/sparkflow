/**
 * GET /api/integrations/google/callback
 *
 * Handles the Google OAuth redirect. Exchanges the authorization code
 * for access + refresh tokens and stores them in the in-memory token
 * store.
 *
 * TODO(WP-integrations): replace the in-memory store with the real
 * `integrations` table (encrypted at rest, scoped by org + user).
 *
 * On success we redirect the browser back to `/integrations` so the
 * UI picks up the new "Connected" state. On error we redirect there
 * with `?error=...` so the page can surface a toast.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireSession } from "@sparkflow/auth";
import {
  getOAuthStateStore,
  googleRedirectUri,
  isGoogleConfigured,
  saveGoogleToken,
} from "../../_store";

export const runtime = "nodejs";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

function bounce(url: URL, params: Record<string, string>): NextResponse {
  const target = new URL("/integrations", url.origin);
  for (const [k, v] of Object.entries(params)) {
    target.searchParams.set(k, v);
  }
  return NextResponse.redirect(target.toString(), 302);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return bounce(url, { error: oauthError });
  }
  if (!code || !state) {
    return bounce(url, { error: "missing_code_or_state" });
  }
  if (!isGoogleConfigured()) {
    return bounce(url, { error: "not_configured" });
  }

  try {
    const session = await requireSession();

    const states = getOAuthStateStore();
    const entry = states.get(state);
    states.delete(state);
    if (!entry) {
      return bounce(url, { error: "invalid_state" });
    }
    if (entry.userId !== session.user.id) {
      return bounce(url, { error: "state_user_mismatch" });
    }
    // Discard states older than 10 minutes as a safety net.
    if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
      return bounce(url, { error: "state_expired" });
    }

    const body = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => "");
      return bounce(url, {
        error: "token_exchange_failed",
        detail: errText.slice(0, 200),
      });
    }
    const token = (await tokenRes.json()) as TokenResponse;

    saveGoogleToken(session.user.id, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + token.expires_in * 1000,
      scopes: token.scope,
    });

    return bounce(url, { connected: "google" });
  } catch (err) {
    if (err instanceof AuthError) {
      return bounce(url, { error: "unauthenticated" });
    }
    return bounce(url, {
      error: "callback_failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
