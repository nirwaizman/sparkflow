/**
 * POST /api/referrals/code
 *
 * Returns the caller's referral code, creating one on first call.
 * Idempotent — repeated calls for the same user return the same code.
 */
import { NextResponse } from "next/server";
import { getSession } from "@sparkflow/auth";
import { generateReferralCode } from "@sparkflow/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const code = generateReferralCode(session.user.id);
  return NextResponse.json({ code });
}
