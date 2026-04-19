/**
 * GET /api/meetings/:id — return the full meeting record, including notes
 *                          (once processing has finished).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@sparkflow/auth";
import { captureError } from "@sparkflow/observability";
import { getMeeting } from "@sparkflow/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const row = await getMeeting(id, session.organizationId);
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      meeting: {
        id: row.id,
        title: row.title,
        status: row.status,
        error: row.error ?? null,
        mime: row.mime,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        notes: row.notes ?? null,
      },
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/meetings/[id].GET" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
