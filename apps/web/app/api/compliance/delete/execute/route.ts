/**
 * POST /api/compliance/delete/execute
 *
 * Admin-only endpoint that finalizes a scheduled deletion. In production
 * this would be triggered by a cron worker after the soft-delete window
 * has elapsed; we keep the manual endpoint for ops debugging.
 *
 * Body: `{ token: string }` — the deletion token returned by
 * `POST /api/compliance/delete`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AuthError,
  getSession,
  logAudit,
  requireRole,
} from "@sparkflow/auth";
import { executeDeletion, getDeletionRequest } from "@sparkflow/compliance";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
});

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

  const request = getDeletionRequest(parsed.token);
  if (!request) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (request.organizationId !== session.organizationId) {
    // Prevent cross-tenant execution by an admin of a different org.
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await executeDeletion(parsed.token);

    await logAudit(
      {
        action: "compliance.delete.execute",
        targetType: "user",
        targetId: result.userId,
        metadata: {
          token: result.token,
          removed: result.removed,
          executedAt: result.executedAt.toISOString(),
        },
      },
      session,
    );

    return NextResponse.json({
      token: result.token,
      userId: result.userId,
      executedAt: result.executedAt.toISOString(),
      removed: result.removed,
    });
  } catch (err) {
    captureError(err, { route: "api/compliance/delete/execute.POST" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal_error" },
      { status: 500 },
    );
  }
}
