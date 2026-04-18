/**
 * GET    /api/files/:id — metadata + signed download URL.
 * DELETE /api/files/:id — remove storage blob and DB row. `file_chunks`
 *                          rows cascade via FK.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@sparkflow/auth";
import { getDb, files } from "@sparkflow/db";
import { captureError, logger } from "@sparkflow/observability";
import { getSignedUrl, deleteFromStorage } from "@/lib/files/storage";

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
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.organizationId, session.organizationId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let downloadUrl: string | null = null;
    try {
      downloadUrl = await getSignedUrl(row.storagePath, 600);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), fileId: id },
        "api.files.get.sign_failed",
      );
    }

    return NextResponse.json({
      file: {
        id: row.id,
        name: row.name,
        mime: row.mime,
        sizeBytes: row.sizeBytes,
        status: row.status,
        error: row.error,
        createdAt: row.createdAt,
        downloadUrl,
      },
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/files/[id].GET" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const db = getDb();

    const [row] = await db
      .select({ id: files.id, storagePath: files.storagePath })
      .from(files)
      .where(and(eq(files.id, id), eq(files.organizationId, session.organizationId)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      await deleteFromStorage(row.storagePath);
    } catch (err) {
      // Storage delete is best-effort; DB row is source of truth.
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), fileId: id },
        "api.files.delete.storage_failed",
      );
    }

    await db.delete(files).where(eq(files.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/files/[id].DELETE" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
