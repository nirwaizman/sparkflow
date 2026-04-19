/**
 * GET /api/sso/authorize?org=slug
 *
 * Starts a WorkOS SAML/OIDC login. Resolves the WorkOS organization /
 * connection identifier from the `org` query parameter — in most
 * deployments the caller will pass their SparkFlow org slug and we map
 * it 1:1 to a WorkOS "connection" slug. We pass it through verbatim so
 * operators can use the raw WorkOS org id (`org_...`) too.
 *
 * Redirects the browser to WorkOS when configured, otherwise returns
 * 503 with a human-readable message.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizationUrl } from "@sparkflow/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const org = req.nextUrl.searchParams.get("org");
  if (!org) {
    return NextResponse.json({ error: "missing_org" }, { status: 400 });
  }

  // The callback route must be absolute and registered in the WorkOS
  // dashboard. Derive it from the incoming request so staging vs prod
  // use the right host without another env var.
  const redirectUri = new URL("/api/sso/callback", req.nextUrl.origin).toString();

  const result = getAuthorizationUrl({
    organization: org,
    redirectUri,
    state: org, // round-trip the slug so the callback knows which tenant.
  });

  if (!result.configured) {
    return NextResponse.json(
      { error: "sso_not_configured", detail: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.redirect(result.url);
}
