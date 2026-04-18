/**
 * GET /api/files/:id/status — `{status, chunks_count}`. Used by the
 * upload UI to poll until ingest finishes.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { requireSession } from "@sparkflow/auth";
import { getDb, files, fileChunks } from "@sparkflow/db";
import { captureError } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const db = getDb();

    const [row] = await db
      .select({ id: files.id, status: files.status, error: files.error })
      .from(files)
      .where(and(eq(files.id, id), eq(files.organizationId, session.organizationId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [c] = await db
      .select({ n: count() })
      .from(fileChunks)
      .where(eq(fileChunks.fileId, id));

    return NextResponse.json({
      status: row.status,
      chunks_count: Number(c?.n ?? 0),
      error: row.error,
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/files/[id]/status.GET" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
