/**
 * POST /api/billing/portal
 *
 * Requires a session with role `owner`. Creates a Stripe customer portal
 * session and returns `{ url }`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getSession, requireRole, AuthError } from "@sparkflow/auth";
import { getDb, subscriptions } from "@sparkflow/db";
import { createPortalSession } from "@sparkflow/billing";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origin(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    requireRole(session, "owner");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }

  const db = getDb();
  const [row] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, session.organizationId))
    .limit(1);

  if (!row?.stripeCustomerId) {
    return NextResponse.json(
      { error: "no_subscription" },
      { status: 404 },
    );
  }

  try {
    const result = await createPortalSession({
      stripeCustomerId: row.stripeCustomerId,
      returnUrl: `${origin(req)}/billing`,
    });
    return NextResponse.json({ url: result.url });
  } catch (err) {
    captureError(err, { route: "billing.portal", orgId: session.organizationId });
    return NextResponse.json({ error: "portal_failed" }, { status: 500 });
  }
}
