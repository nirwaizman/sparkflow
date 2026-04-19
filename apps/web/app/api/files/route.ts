/**
 * GET  /api/files            — list the caller's org files.
 * POST /api/files (multipart) — upload + enqueue ingest. Returns 202.
 *
 * WP-C4: ingest is kicked off via `setImmediate` (fire-and-forget).
 * WP-C4.5 will replace this with an Inngest event.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "@sparkflow/auth";
import { getDb, files } from "@sparkflow/db";
import { logger, captureError, incr } from "@sparkflow/observability";
import { uploadToStorage } from "@/lib/files/storage";
import { ingestFile } from "@/lib/files/ingest";
import { emitEvent } from "@/lib/public-api/emit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function GET() {
  try {
    const session = await requireSession();
    const db = getDb();
    const rows = await db
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        sizeBytes: files.sizeBytes,
        status: files.status,
        error: files.error,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(eq(files.organizationId, session.organizationId))
      .orderBy(desc(files.createdAt));
    return NextResponse.json({ files: rows });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/files.GET" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
    }

    const form = await req.formData();
    const fileField = form.get("file");
    if (!fileField || typeof fileField === "string") {
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }

    const blob = fileField as File;
    const name = blob.name || "untitled";
    const mime = blob.type || "application/octet-stream";
    const size = blob.size;

    if (!SUPPORTED_MIMES.has(mime)) {
      return NextResponse.json(
        { error: "unsupported_mime", mime, supported: [...SUPPORTED_MIMES] },
        { status: 415 },
      );
    }
    if (size <= 0) {
      return NextResponse.json({ error: "empty_file" }, { status: 400 });
    }
    if (size > MAX_BYTES) {
      return NextResponse.json(
        { error: "file_too_large", maxBytes: MAX_BYTES },
        { status: 413 },
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    // Deterministic storage key: {org}/{sha}/{name}. The sha prefix
    // gives us free dedupe + keeps collisions impossible.
    const safeName = name.replace(/[^\w.-]/g, "_");
    const storagePath = `${session.organizationId}/${sha256}/${safeName}`;

    await uploadToStorage({
      key: storagePath,
      contentType: mime,
      body: buffer,
    });

    const db = getDb();
    const [inserted] = await db
      .insert(files)
      .values({
        organizationId: session.organizationId,
        userId: session.user.id,
        name,
        mime,
        sizeBytes: size,
        storagePath,
        sha256,
        status: "uploaded",
      })
      .returning({ id: files.id });

    if (!inserted) {
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    logger.info(
      { fileId: inserted.id, mime, size, org: session.organizationId },
      "api.files.upload",
    );
    incr("files.upload", { mime });

    // Fire-and-forget ingest. Errors are swallowed inside ingestFile
    // and recorded on the row's status column.
    setImmediate(() => {
      ingestFile(inserted.id).catch(() => {
        /* already logged */
      });
    });

    emitEvent({
      organizationId: session.organizationId,
      event: "file.uploaded",
      data: { fileId: inserted.id, name, mime, sizeBytes: size },
    });

    return NextResponse.json({ id: inserted.id, status: "uploaded" }, { status: 202 });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/files.POST" });
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "api.files.upload.failed",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
