/**
 * Shared guard for `/api/v1/**` routes.
 *
 * Verifies the API key, applies per-key rate limiting, and returns
 * either a 401/429 `NextResponse` or a `VerifiedApiKey` the route
 * handler can use to scope downstream calls. Centralising this keeps
 * every public route down to a couple of lines.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyApiKey, type VerifiedApiKey } from "@sparkflow/public-api";
import { rateLimit } from "./rate-limit";

export type GuardResult =
  | { ok: true; caller: VerifiedApiKey }
  | { ok: false; response: NextResponse };

export async function guardPublicRequest(req: NextRequest): Promise<GuardResult> {
  const auth = req.headers.get("authorization") ?? req.headers.get("x-api-key");
  const caller = await verifyApiKey(auth);
  if (!caller) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const limit = rateLimit(caller.apiKeyId);
  if (!limit.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
            "X-RateLimit-Limit": String(limit.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      ),
    };
  }

  return { ok: true, caller };
}

/**
 * Proxy the request body to an internal route handler. We re-use the
 * existing internal `/api/<thing>` routes as the source of truth; the
 * public route just swaps out session auth for API-key auth and
 * forwards JSON through.
 *
 * We attach special headers so the internal route can see a verified
 * caller without going through Supabase session auth. Internal routes
 * today still check `getSession()`; see TODO in this package for the
 * path to make the API-key path a first-class peer.
 *
 * TODO: teach internal routes to accept an API-key-authenticated
 * caller directly (e.g. via a request-scoped `x-sf-api-caller` header
 * signed by the edge) so this proxy can be removed.
 */
export async function proxyToInternal(
  req: NextRequest,
  internalPath: string,
  caller: VerifiedApiKey,
): Promise<NextResponse> {
  const url = new URL(internalPath, req.nextUrl.origin);
  // Preserve query string on forwarded GETs.
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    url.searchParams.set(key, value);
  }

  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("x-sf-api-caller-id", caller.apiKeyId);
  headers.set("x-sf-api-org-id", caller.organizationId);
  headers.set("x-sf-api-user-id", caller.userId);
  // Forward the original auth so legacy handlers that still look for
  // it can fall back to verifying the key themselves.
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const text = await res.text();
  const responseHeaders = new Headers();
  const forward = res.headers.get("content-type");
  if (forward) responseHeaders.set("content-type", forward);
  return new NextResponse(text, { status: res.status, headers: responseHeaders });
}
