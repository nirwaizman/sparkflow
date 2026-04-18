/**
 * File → chunks → embeddings ingest pipeline.
 *
 * Called fire-and-forget from the upload route for WP-C4, and will be
 * moved to an Inngest step function in WP-C4.5. The function is
 * intentionally self-contained: given a `fileId` it loads the row,
 * downloads the blob, parses it, chunks, embeds, inserts, and toggles
 * the status column.
 *
 * Errors are caught and written to `files.status = 'failed'` with the
 * message in `files.error`; we never rethrow so the caller's
 * `setImmediate` doesn't crash the Node process.
 */
import { eq } from "drizzle-orm";
import { getDb, files, fileChunks, type NewFileChunk } from "@sparkflow/db";
import {
  parseFile,
  chunkText,
  createOpenAIEmbedder,
  mockEmbedder,
  type EmbedFn,
  type Chunk,
} from "@sparkflow/rag";
import { logger, captureError } from "@sparkflow/observability";
import { downloadFromStorage } from "./storage";

const BATCH_SIZE = 50;

function resolveEmbedder(): EmbedFn {
  if (process.env["OPENAI_API_KEY"]) {
    return createOpenAIEmbedder();
  }
  logger.warn({}, "files.ingest.embedder.fallback_mock");
  return mockEmbedder;
}

export async function ingestFile(fileId: string): Promise<void> {
  const log = logger.child({ fileId, op: "files.ingest" });
  const db = getDb();

  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row) {
    log.warn({}, "files.ingest.not_found");
    return;
  }

  try {
    log.info({ name: row.name, mime: row.mime }, "files.ingest.start");
    await db
      .update(files)
      .set({ status: "processing", error: null })
      .where(eq(files.id, fileId));

    // 1. Download blob from storage.
    const buffer = await downloadFromStorage(row.storagePath);
    log.debug({ bytes: buffer.byteLength }, "files.ingest.downloaded");

    // 2. Parse → text.
    const parsed = await parseFile({ buffer, mime: row.mime });
    if (!parsed.text.trim()) {
      throw new Error("parsed file yielded empty text");
    }

    // 3. Chunk.
    const chunks = chunkText(parsed.text, { strategy: "semantic" });
    log.info({ chunks: chunks.length }, "files.ingest.chunked");

    if (chunks.length === 0) {
      throw new Error("chunkText produced zero chunks");
    }

    // 4. Embed in batches.
    const embed = resolveEmbedder();
    const contents = chunks.map((c: Chunk) => c.content);
    const vectors: number[][] = [];
    for (let i = 0; i < contents.length; i += BATCH_SIZE) {
      const slice = contents.slice(i, i + BATCH_SIZE);
      const out = await embed(slice);
      vectors.push(...out);
      log.debug(
        { done: Math.min(i + BATCH_SIZE, contents.length), total: contents.length },
        "files.ingest.embedded_batch",
      );
    }

    // 5. Insert chunks in batches of 50.
    const rows: NewFileChunk[] = chunks.map((c: Chunk, idx: number) => ({
      fileId,
      chunkIndex: idx,
      content: c.content,
      tokens: c.tokens,
      embedding: vectors[idx] ?? null,
      metadata: {
        ...c.metadata,
        sourceName: row.name,
        sourceMime: row.mime,
      },
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const slice = rows.slice(i, i + BATCH_SIZE);
      await db.insert(fileChunks).values(slice);
    }

    await db.update(files).set({ status: "ready", error: null }).where(eq(files.id, fileId));
    log.info({ chunks: chunks.length }, "files.ingest.done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "files.ingest.failed");
    captureError(err, { route: "files.ingest", fileId });
    try {
      await db
        .update(files)
        .set({ status: "failed", error: message.slice(0, 500) })
        .where(eq(files.id, fileId));
    } catch (updateErr) {
      log.error(
        { err: updateErr instanceof Error ? updateErr.message : String(updateErr) },
        "files.ingest.status_update_failed",
      );
    }
  }
}
