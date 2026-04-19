/**
 * POST /api/integrations/google/disconnect
 *
 * Clears the caller's stored Google tokens. Best-effort revokes the
 * access token with Google so the consent is actually released — but
 * we always return 200 on success even if Google's revoke endpoint
 * errors, because the user-visible state (token removed locally) is
 * what matters for the UI.
 *
 * TODO(WP-integrations): also delete the corresponding row from the
 * real `integrations` table once it exists.
 */
import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@sparkflow/auth";
import { clearGoogleToken, getGoogleToken } from "../../_store";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await requireSession();
    const existing = getGoogleToken(session.user.id);
    clearGoogleToken(session.user.id);

    if (existing?.access_token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(existing.access_token)}`,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
          },
        );
      } catch {
        // Ignore — revoke is best-effort.
      }
    }

    return NextResponse.json({ connected: false });
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
