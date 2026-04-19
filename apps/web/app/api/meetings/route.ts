/**
 * GET /api/meetings — list the caller's org meetings (metadata only).
 *
 * Upload uses `/api/meetings/upload`; this endpoint is a simple collection
 * listing used by the meetings dashboard.
 */
import { NextResponse } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { captureError } from "@sparkflow/observability";
import { listMeetings } from "@sparkflow/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await listMeetings(session.organizationId);
    return NextResponse.json({
      meetings: rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        error: r.error ?? null,
        mime: r.mime,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/meetings.GET" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
