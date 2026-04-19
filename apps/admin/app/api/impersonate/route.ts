/**
 * Impersonation handoff.
 *
 * Flow:
 *   1. Admin clicks Impersonate on a user detail page.
 *   2. We verify the caller's session via `@sparkflow/auth`
 *      (middleware already allow-listed the admin email).
 *   3. We mint an HS256 JWT containing:
 *        { sub: targetUserId, act: adminUserId, iat, exp, jti }
 *      signed with `ADMIN_IMPERSONATION_SECRET`. `getSession()` in the
 *      web app will recognise this envelope via the `sf-impersonating`
 *      cookie and treat the request as "impersonating sub on behalf of
 *      act".
 *   4. We set `sf-impersonating` as an httpOnly cookie on the shared
 *      cookie domain (`ADMIN_COOKIE_DOMAIN`, e.g. `.sparkflow.app`).
 *      For local dev the cookie is host-only.
 *   5. We write an audit-log row — this endpoint is the canonical
 *      provenance for "adminX started impersonating userY at Z".
 *
 * We intentionally avoid adding a JWT library dependency — HS256 is a
 * five-line HMAC so we use `node:crypto` directly. Token lifetime is
 * 1h (short by design); operators re-click to extend.
 *
 * DELETE clears the cookie and logs `admin.impersonate.stop`. The web
 * banner's "Stop" button is expected to call this (follow-up, see the
 * TODO at the bottom of this file).
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, logAudit, requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const IMPERSONATE_COOKIE = "sf-impersonating";
const TTL_SECONDS = 60 * 60; // 1 hour

const schema = z.object({ userId: z.string().uuid() });

// ---------------------------------------------------------------------------
// Minimal HS256 JWT (header.payload.signature, base64url-encoded segments).
// Exported so unit tests in apps/admin can round-trip a token without
// pulling in `jose`.
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function secret(): string {
  const s = process.env.ADMIN_IMPERSONATION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "ADMIN_IMPERSONATION_SECRET missing or too short (need >= 32 chars)",
    );
  }
  return s;
}

export interface ImpersonationClaims {
  /** The user being impersonated. */
  sub: string;
  /** The acting admin (RFC 8693-style "actor"). */
  act: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
  /** Unique token id for audit/revocation. */
  jti: string;
}

export function mintImpersonationJwt(claims: ImpersonationClaims): string {
  const header = { alg: "HS256", typ: "JWT" };
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(claims));
  const sig = createHmac("sha256", secret()).update(`${h}.${p}`).digest();
  return `${h}.${p}.${base64UrlEncode(sig)}`;
}

/**
 * Verify + decode an impersonation JWT. Returns the claims on success,
 * null on any failure (invalid signature, expired, malformed). Used by
 * `@sparkflow/auth`'s `getSession` once the web-side integration lands.
 */
export function verifyImpersonationJwt(
  token: string,
): ImpersonationClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;

  const expected = createHmac("sha256", secret())
    .update(`${h}.${p}`)
    .digest();
  let got: Buffer;
  try {
    got = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
  if (got.length !== expected.length) return null;
  if (!timingSafeEqual(got, expected)) return null;

  let claims: ImpersonationClaims;
  try {
    const json = Buffer.from(
      p.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    claims = JSON.parse(json) as ImpersonationClaims;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  if (typeof claims.sub !== "string" || typeof claims.act !== "string") {
    return null;
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    // Refuse admin impersonating themselves — common footgun.
    if (body.userId === session.user.id) {
      return NextResponse.json(
        { error: "cannot_impersonate_self" },
        { status: 400 },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const jti = randomUUID();
    const token = mintImpersonationJwt({
      sub: body.userId,
      act: session.user.id,
      iat: now,
      exp: now + TTL_SECONDS,
      jti,
    });

    await logAudit(
      {
        action: "admin.impersonate.start",
        targetType: "user",
        targetId: body.userId,
        metadata: { via: "admin-console", jti, ttlSec: TTL_SECONDS },
      },
      session,
    );

    const res = NextResponse.json({ ok: true, userId: body.userId, jti });
    res.cookies.set(IMPERSONATE_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.ADMIN_COOKIE_DOMAIN || undefined,
      path: "/",
      maxAge: TTL_SECONDS,
    });
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  void req;
  try {
    const session = await requireSession();
    await logAudit(
      {
        action: "admin.impersonate.stop",
        targetType: "user",
        metadata: { via: "admin-console" },
      },
      session,
    );
    const res = NextResponse.json({ ok: true });
    res.cookies.set(IMPERSONATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.ADMIN_COOKIE_DOMAIN || undefined,
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "server_error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// TODO(follow-up, out of scope for this PR — apps/admin only):
//   1. Teach `@sparkflow/auth`'s `getSession()` to read the
//      `sf-impersonating` cookie, call `verifyImpersonationJwt`, and
//      return `{ user: <target>, impersonatedBy: <admin> }` when present.
//   2. Add a banner in `apps/web/components/shell/top-bar.tsx` that
//      shows "Impersonating <email> — Stop" when the session carries
//      `impersonatedBy`. The Stop button should DELETE /api/impersonate
//      (which already exists above) proxied from the web app.
//   3. Persist a revocation list (`impersonation_revocations` table
//      keyed by `jti`) so a stolen token can be killed server-side
//      without waiting for the 1h TTL.
// ---------------------------------------------------------------------------
