/**
 * Web middleware.
 *
 * Two responsibilities:
 *  1. Route auth — redirect unauthenticated requests on protected paths
 *     to `/login?next=<path>`. We don't hit the DB here; we only verify
 *     that a Supabase auth cookie exists. Deep session resolution
 *     happens in Server Components via `getSession()`.
 *  2. Rate limiting (WP-A5 lightweight) — in-memory token bucket keyed
 *     by client IP. 60 req/min. `/api/health` is exempt. This is a
 *     best-effort single-process limiter intended to be replaced by an
 *     Upstash-backed implementation later; the single-process caveat
 *     means it won't hold across serverless instances.
 *
 * IMPORTANT: middleware runs on the Edge runtime. Do NOT import
 * `@sparkflow/auth` here — that module pulls in `postgres` + Drizzle,
 * which are not edge-safe.
 */
import { NextResponse, type NextRequest } from "next/server";

// -----------------------------------------------------------------------
// Public path matcher
// -----------------------------------------------------------------------

const PUBLIC_EXACT = new Set<string>([
  "/",
  "/login",
  "/signup",
  "/api/health",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES: readonly string[] = [
  "/share/",
  "/_next/",
  "/static/",
  "/og-images/",
  "/auth/callback", // OAuth/magic-link return URL
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
// Rate limiter — in-memory token bucket per IP
// -----------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const MAX_BUCKETS = 5_000; // rough LRU cap

const buckets: Map<string, Bucket> = new Map();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(ip, bucket);
  }
  bucket.count += 1;

  // Opportunistic LRU: if the map is too large, drop the oldest bucket
  // (Map iteration preserves insertion order).
  if (buckets.size > MAX_BUCKETS) {
    const firstKey = buckets.keys().next().value;
    if (firstKey !== undefined) buckets.delete(firstKey);
  }

  if (bucket.count > RATE_LIMIT) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limit everything except the health probe. Applied before auth
  // so unauthenticated floods also get capped.
  if (pathname !== "/api/health") {
    const ip = clientIp(req);
    const result = rateLimit(ip);
    if (!result.ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "retry-after": String(result.retryAfter),
          "content-type": "text/plain; charset=utf-8",
        },
      });
    }
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Guest-mode bypass for API routes that implement their own guest gating
  // (e.g. /api/chat, /api/chat/stream). The route handler itself re-verifies.
  if (pathname.startsWith("/api/") && req.headers.get("x-guest-mode") === "1") {
    return NextResponse.next();
  }

  if (!hasSupabaseAuthCookie(req)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
