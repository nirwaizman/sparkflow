/**
 * POST /api/meetings/upload
 *
 * Accepts a single audio file via multipart/form-data (`file` field).
 * Supported MIME types: audio/wav, audio/mpeg, audio/mp4 / audio/m4a, audio/webm.
 * Max body size: 100 MB.
 *
 * On success:
 *   1. Uploads the blob to the Supabase `meetings` bucket at
 *      `{org}/{id}/{safeName}`.
 *   2. Creates a `MeetingRecord` in the in-memory store (see TODO in
 *      `@sparkflow/meetings/src/store.ts`).
 *   3. Returns `{ id, status: "uploaded" }` with HTTP 202.
 *
 * The client is expected to POST `/api/meetings/:id/process` next (or have the
 * server fire-and-forget the processor). We keep the pipeline triggered
 * explicitly so the UI can show distinct upload / process stages.
 */
import { NextResponse, type NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { requireSession } from "@sparkflow/auth";
import { captureError, logger, incr } from "@sparkflow/observability";
import { createMeeting, uploadMeetingAudio } from "@sparkflow/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_MIMES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
]);

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

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
    const titleField = form.get("title");
    const title =
      typeof titleField === "string" && titleField.trim().length > 0
        ? titleField.trim()
        : null;

    const blob = fileField as File;
    const name = blob.name || "meeting-audio";
    const mime = (blob.type || "application/octet-stream").toLowerCase();
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

    const id = nanoid(16);
    const safeName = name.replace(/[^\w.-]/g, "_");
    const storagePath = `${session.organizationId}/${id}/${safeName}`;

    await uploadMeetingAudio({ key: storagePath, contentType: mime, body: buffer });

    const record = await createMeeting({
      id,
      organizationId: session.organizationId,
      userId: session.user.id,
      title: title ?? defaultTitle(name),
      storagePath,
      mime,
      sizeBytes: size,
    });

    logger.info(
      { meetingId: id, mime, size, org: session.organizationId },
      "api.meetings.upload",
    );
    incr("meetings.upload", { mime });

    return NextResponse.json(
      { id: record.id, status: record.status },
      { status: 202 },
    );
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/meetings/upload.POST" });
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "api.meetings.upload.failed",
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

function defaultTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  if (!base) return "Untitled meeting";
  return base.length > 120 ? `${base.slice(0, 117)}...` : base;
}
