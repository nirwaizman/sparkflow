/**
 * GET /api/integrations/google/drive/list
 *
 * Returns the caller's top 20 Drive files using the stored access
 * token. Responds `{ connected: false }` (HTTP 200) when the user
 * hasn't connected Google yet so the UI can render a Connect CTA
 * without treating this as an error.
 *
 * TODO(WP-integrations): read tokens from the real `integrations`
 * table and transparently refresh using the refresh_token when the
 * access token is expired.
 */
import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@sparkflow/auth";
import { getGoogleToken } from "../../../_store";

export const runtime = "nodejs";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type DriveListResponse = {
  files?: DriveFile[];
  error?: { message: string };
};

export async function GET() {
  try {
    const session = await requireSession();
    const token = getGoogleToken(session.user.id);
    if (!token) {
      return NextResponse.json({ connected: false });
    }
    if (token.expires_at <= Date.now()) {
      // TODO(WP-integrations): use refresh_token to mint a fresh
      // access token. For now we surface an explicit expired state.
      return NextResponse.json(
        { connected: true, expired: true, files: [] },
        { status: 200 },
      );
    }

    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("pageSize", "20");
    url.searchParams.set(
      "fields",
      "files(id,name,mimeType,modifiedTime,webViewLink)",
    );
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");

    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          connected: true,
          error: `Drive API ${res.status}`,
          detail: text.slice(0, 200),
          files: [],
        },
        { status: 200 },
      );
    }
    const data = (await res.json()) as DriveListResponse;
    return NextResponse.json({ connected: true, files: data.files ?? [] });
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
