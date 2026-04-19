/**
 * GET /api/integrations/google/connect
 *
 * Kicks off the Google OAuth flow. Reads `GOOGLE_CLIENT_ID` +
 * `GOOGLE_CLIENT_SECRET` from env; if either is missing, replies
 * JSON `{ configured: false, message }` so the UI can render a
 * "Not configured" pill instead of crashing.
 *
 * When configured, redirects to the Google consent URL with the
 * Drive + Gmail read-only scopes. A short-lived `state` nonce is
 * stored in-memory and must be echoed back by the callback route.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { AuthError, requireSession } from "@sparkflow/auth";
import {
  GOOGLE_SCOPES,
  getOAuthStateStore,
  googleRedirectUri,
  isGoogleConfigured,
} from "../../_store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();

    if (!isGoogleConfigured()) {
      return NextResponse.json(
        {
          configured: false,
          message: "Google OAuth not configured",
        },
        { status: 200 },
      );
    }

    const state = randomBytes(16).toString("hex");
    getOAuthStateStore().set(state, {
      userId: session.user.id,
      createdAt: Date.now(),
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", googleRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    url.searchParams.set("state", state);

    return NextResponse.redirect(url.toString(), 302);
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
