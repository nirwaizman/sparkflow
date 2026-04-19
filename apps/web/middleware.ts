/**
 * Web middleware.
 *
 * Three responsibilities:
 *  1. Route auth — redirect unauthenticated requests on protected paths
 *     to `/login?next=<path>`. We don't hit the DB here; we only verify
 *     that a Supabase auth cookie exists. Deep session resolution
 *     happens in Server Components via `getSession()`.
 *  2. Rate limiting — Upstash-backed via `@sparkflow/security`
 *     (`rateLimitFor("api")`). Falls back to in-memory automatically
 *     when Upstash envs are missing. `/api/health` is exempt.
 *  3. Security headers — HSTS, XFO, nosniff, Referrer-Policy,
 *     Permissions-Policy, plus a per-request CSP with nonce, applied to
 *     every response.
 *
 * IMPORTANT: middleware runs on the Edge runtime. Do NOT import
 * `@sparkflow/auth` here — that module pulls in `postgres` + Drizzle,
 * which are not edge-safe. `@sparkflow/security` is edge-safe (no node
 * built-ins at import time; Upstash SDK is fetch-based).
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimitFor } from "@sparkflow/security/rate-limit";
import { buildCSP, generateNonce, getCSPHeaderName } from "@sparkflow/security/csp";
import { applyDefaultSecurityHeaders } from "./lib/security/headers";

// -----------------------------------------------------------------------
// Public path matcher
// -----------------------------------------------------------------------

const PUBLIC_EXACT = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/api/health",
  // Stripe webhook: no session cookie, signature-verified in the handler.
  "/api/billing/webhook",
  // Vapi phone webhook: no session cookie, shared-secret verified in the handler.
  "/api/phone/webhook",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES: readonly string[] = [
  "/share/",
  "/_next/",
  "/static/",
  "/og-images/",
  "/auth/callback", // OAuth/magic-link return URL (PKCE / code flow)
  "/auth/confirm",  // Magic-link client-side token handler (fragment flow)
  "/auth/sync",     // Called by /auth/confirm to upsert user + org
  "/auth/devlogin", // Dev-only one-shot login (guarded by NODE_ENV + DEV_LOGIN_EMAIL)
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

// -----------------------------------------------------------------------
// Supabase auth cookie detection
// -----------------------------------------------------------------------
// `@supabase/ssr` stores the session in cookies named like
// `sb-<project-ref>-auth-token` (and chunked variants). We don't need
// to parse them — presence of any such cookie is enough to skip the
// login redirect and defer real verification to the Server Component.
function hasSupabaseAuthCookie(req: NextRequest): boolean {
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) return true;
  }
  return false;
}

// -----------------------------------------------------------------------
// Rate limiter
// -----------------------------------------------------------------------
// `rateLimitFor` caches the underlying limiter per-kind across invocations
// within the same edge isolate, so we can call it unconditionally.

const limitApi = rateLimitFor("api");

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

// -----------------------------------------------------------------------
// Response decoration — security headers + CSP
// -----------------------------------------------------------------------

function decorateResponse(res: NextResponse, nonce: string): NextResponse {
  applyDefaultSecurityHeaders(res.headers);
  const dev = process.env.NODE_ENV !== "production";
  const csp = buildCSP({ nonce, dev });
  res.headers.set(getCSPHeaderName({ reportOnly: false }), csp);
  // Expose the nonce so Server Components / `<Script nonce=...>` can read
  // it via `headers()` in the App Router.
  res.headers.set("x-nonce", nonce);
  return res;
}

// -----------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const nonce = generateNonce();

  // Rate limit everything except the health probe. Applied before auth
  // so unauthenticated floods also get capped.
  if (pathname !== "/api/health") {
    const ip = clientIp(req);
    const result = await limitApi(ip);
    if (!result.success) {
      const res = new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "retry-after": String(result.retryAfter ?? 60),
          "content-type": "text/plain; charset=utf-8",
        },
      });
      return decorateResponse(res, nonce);
    }
  }

  if (isPublicPath(pathname)) {
    return decorateResponse(NextResponse.next(), nonce);
  }

  // Guest-mode bypass for API routes that implement their own guest gating
  // (e.g. /api/chat, /api/chat/stream). The route handler itself re-verifies.
  if (pathname.startsWith("/api/") && req.headers.get("x-guest-mode") === "1") {
    return decorateResponse(NextResponse.next(), nonce);
  }

  if (!hasSupabaseAuthCookie(req)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return decorateResponse(NextResponse.redirect(loginUrl), nonce);
  }

  return decorateResponse(NextResponse.next(), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
