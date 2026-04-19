/**
 * GET /api/integrations/gmail/messages
 *
 * Returns the caller's top 20 Gmail messages (threadId, snippet,
 * subject, from, date). Responds `{ connected: false }` (HTTP 200)
 * when no token is stored so the UI can render a Connect CTA.
 *
 * TODO(WP-integrations): read tokens from the real `integrations`
 * table, refresh using refresh_token when expired, and move the
 * pagination/fetch logic into a shared Gmail client helper.
 */
import { NextResponse } from "next/server";
import { AuthError, requireSession } from "@sparkflow/auth";
import { getGoogleToken } from "../../_store";

export const runtime = "nodejs";

type ListResponse = {
  messages?: { id: string; threadId: string }[];
  resultSizeEstimate?: number;
};

type MessageDetail = {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
  internalDate?: string;
};

type Summary = {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  date: string;
  subject: string;
};

function readHeader(msg: MessageDetail, name: string): string {
  const headers = msg.payload?.headers ?? [];
  const hit = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return hit?.value ?? "";
}

export async function GET() {
  try {
    const session = await requireSession();
    const token = getGoogleToken(session.user.id);
    if (!token) {
      return NextResponse.json({ connected: false });
    }
    if (token.expires_at <= Date.now()) {
      // TODO(WP-integrations): use refresh_token to mint a fresh
      // access token.
      return NextResponse.json(
        { connected: true, expired: true, messages: [] },
        { status: 200 },
      );
    }

    const listUrl = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    );
    listUrl.searchParams.set("maxResults", "20");

    const listRes = await fetch(listUrl.toString(), {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
    });
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => "");
      return NextResponse.json(
        {
          connected: true,
          error: `Gmail API ${listRes.status}`,
          detail: text.slice(0, 200),
          messages: [],
        },
        { status: 200 },
      );
    }
    const list = (await listRes.json()) as ListResponse;
    const ids = (list.messages ?? []).map((m) => m.id);

    // Fetch metadata for each message in parallel. Using 20 concurrent
    // requests against Gmail's per-user QPS is well within limits.
    const details = await Promise.all(
      ids.map(async (id) => {
        const url = new URL(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
        );
        url.searchParams.set("format", "metadata");
        url.searchParams.append("metadataHeaders", "From");
        url.searchParams.append("metadataHeaders", "Subject");
        url.searchParams.append("metadataHeaders", "Date");
        const res = await fetch(url.toString(), {
          headers: { authorization: `Bearer ${token.access_token}` },
          cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as MessageDetail;
      }),
    );

    const messages: Summary[] = details
      .filter((m): m is MessageDetail => m !== null)
      .map((m) => ({
        id: m.id,
        threadId: m.threadId,
        snippet: m.snippet ?? "",
        from: readHeader(m, "From"),
        date: readHeader(m, "Date"),
        subject: readHeader(m, "Subject"),
      }));

    return NextResponse.json({ connected: true, messages });
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
