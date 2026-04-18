/**
 * Tiny identity probe used by the admin middleware to confirm the
 * caller's email. Runs on the Node runtime so we can use
 * `@sparkflow/auth` (which pulls in Drizzle / postgres-js). Does NOT
 * gate on `ADMIN_EMAILS` — that's the middleware's job; this endpoint
 * only reports who the session belongs to.
 */
import { NextResponse } from "next/server";
import { getSession } from "@sparkflow/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    email: session.user.email,
    userId: session.user.id,
    organizationId: session.organizationId,
  });
}
