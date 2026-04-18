/**
 * POST /api/billing/checkout
 *
 * Body: `{ tier: "pro" | "team", interval: "month" | "year" }`
 *
 * Requires a session with role `owner` or `admin`. Creates a Stripe
 * Checkout session for the authenticated org and returns `{ url }`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession, requireRole, AuthError } from "@sparkflow/auth";
import { createCheckoutSession } from "@sparkflow/billing";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tier: z.enum(["pro", "team"]),
  interval: z.enum(["month", "year"]),
});

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
    requireRole(session, "admin");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid_body" },
      { status: 400 },
    );
  }

  try {
    const result = await createCheckoutSession({
      tier: parsed.tier,
      interval: parsed.interval,
      organizationId: session.organizationId,
      customerEmail: session.user.email,
      returnUrl: `${origin(req)}/billing`,
    });
    return NextResponse.json({ url: result.url });
  } catch (err) {
    captureError(err, { route: "billing.checkout", orgId: session.organizationId });
    return NextResponse.json({ error: "checkout_failed" }, { status: 500 });
  }
}
