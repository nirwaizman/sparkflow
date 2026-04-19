/**
 * GET  /api/enterprise/ip-allowlist  → return the org's CIDR list
 * POST /api/enterprise/ip-allowlist  → replace the org's CIDR list
 *
 * Admin-only. Requires a SparkFlow session with role ≥ admin on the
 * active org; the org id comes from the session, never the client body.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, requireSession, AuthError } from "@sparkflow/auth";
import { getAllowlist, isValidCidr, setAllowlist } from "@sparkflow/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBody = z.object({
  cidrs: z.array(z.string().min(1)).max(256),
});

export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, "admin");
    return NextResponse.json({ cidrs: getAllowlist(session.organizationId) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, "admin");

    const parsed = PostBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const bad = parsed.data.cidrs.filter((c) => !isValidCidr(c));
    if (bad.length > 0) {
      return NextResponse.json(
        { error: "invalid_cidr", invalid: bad },
        { status: 400 },
      );
    }

    setAllowlist(session.organizationId, parsed.data.cidrs);
    return NextResponse.json({ cidrs: getAllowlist(session.organizationId) });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    throw err;
  }
}
