/**
 * POST /api/compliance/delete
 *
 * Schedules a soft-delete of the authenticated user's data in the active
 * org. Data is not removed immediately; instead the request is recorded
 * with a 30-day grace window, after which the admin endpoint
 * `/api/compliance/delete/execute` (or a scheduled cron job) can finalize
 * the removal.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, getSession, logAudit } from "@sparkflow/auth";
import { requestDeletion } from "@sparkflow/compliance";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    softDays: z.number().int().min(0).max(365).optional(),
  })
  .optional();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let softDays: number | undefined;
  try {
    // Body is optional — tolerate empty / unparseable payloads.
    const text = await req.text();
    if (text.trim().length > 0) {
      const parsed = bodySchema.parse(JSON.parse(text));
      softDays = parsed?.softDays;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid_body" },
      { status: 400 },
    );
  }

  try {
    const { token, scheduledAt } = await requestDeletion(
      session.user.id,
      session.organizationId,
      { softDays: softDays ?? 30 },
    );

    await logAudit(
      {
        action: "compliance.delete.request",
        targetType: "user",
        targetId: session.user.id,
        metadata: { token, scheduledAt: scheduledAt.toISOString() },
      },
      session,
    );

    return NextResponse.json({ token, scheduledAt: scheduledAt.toISOString() });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    captureError(err, { route: "api/compliance/delete.POST" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
