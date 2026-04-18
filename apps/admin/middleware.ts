/**
 * Admin middleware.
 *
 * Auth gate for every page. Two checks (both must pass):
 *   1. Supabase auth cookie exists (presence-only — deep verification
 *      happens in Server Components via `getSession()`).
 *   2. A follow-up server call to `/api/whoami` confirms the
 *      authenticated user's email is in the `ADMIN_EMAILS` env
 *      (comma-separated allow-list).
 *
 * Unauthorized visitors are redirected to `/forbidden`. Middleware
 * runs on the Edge runtime; do NOT import `@sparkflow/auth` here
 * (Drizzle + postgres aren't edge-safe). The `/api/whoami` call is
 * resolved by a tiny internal route that reads the session from the
 * Node runtime.
 */
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_EXACT = new Set<string>([
  "/forbidden",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES: readonly string[] = [
  "/_next/",
  "/static/",
  "/api/whoami",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const p of PUBLIC_PREFIXES) if (pathname.startsWith(p)) return true;
  return false;
}

function hasSupabaseAuthCookie(req: NextRequest): boolean {
  for (const c of req.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) return true;
  }
  return false;
}

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSupabaseAuthCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/forbidden";
    return NextResponse.redirect(url);
  }

  // Backend check: ask our own /api/whoami (Node runtime) to resolve
  // the session and return the email. We then match against
  // ADMIN_EMAILS. Failures (network, unauthenticated) treated as deny.
  const whoamiUrl = req.nextUrl.clone();
  whoamiUrl.pathname = "/api/whoami";
  whoamiUrl.search = "";

  try {
    const res = await fetch(whoamiUrl, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
    });
    if (!res.ok) {
      const url = req.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
    const data = (await res.json()) as { email?: string };
    const email = (data.email ?? "").toLowerCase();
    const allow = adminEmails();
    if (!email || !allow.has(email)) {
      const url = req.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/forbidden";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
