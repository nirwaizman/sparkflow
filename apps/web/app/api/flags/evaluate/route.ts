/**
 * GET /api/flags/evaluate?keys=a,b,c
 *
 * Resolves the supplied comma-separated list of flag keys against the
 * caller's active org (and user id, for bucketing). Unauthenticated
 * callers get a global-only evaluation, which matches what a marketing
 * page or pre-login flow would see.
 *
 * Response: `{ flags: Record<string, boolean> }`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@sparkflow/auth";
import { resolveFlags } from "../../../../lib/flags/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 64;
const KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("keys") ?? "";
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .filter((k) => KEY_PATTERN.test(k))
    .slice(0, MAX_KEYS);

  if (keys.length === 0) {
    return NextResponse.json({ flags: {} });
  }

  const session = await getSession();
  const flags = await resolveFlags(keys, {
    organizationId: session?.organizationId ?? null,
    userId: session?.user.id ?? null,
  });

  return NextResponse.json({ flags });
}
