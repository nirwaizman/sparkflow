/**
 * POST /api/files/search
 *
 * Body: `{ query: string, topK?: number, fileId?: string }`
 *
 * Embeds the query and runs `hybridRetrieve` against the org-scoped
 * `PgVectorStore`. Returns the ranked chunks, the query, and the total
 * latency so the UI can surface it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";
import {
  hybridRetrieve,
  createOpenAIEmbedder,
  mockEmbedder,
  type EmbedFn,
} from "@sparkflow/rag";
import { captureError, logger, observe } from "@sparkflow/observability";
import { createPgVectorStore } from "@/lib/files/vector-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(1).max(4000),
  topK: z.number().int().min(1).max(50).optional(),
  fileId: z.string().uuid().optional(),
});

function resolveEmbedder(): EmbedFn {
  return process.env["OPENAI_API_KEY"] ? createOpenAIEmbedder() : mockEmbedder;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    let parsed: z.infer<typeof bodySchema>;
    try {
      parsed = bodySchema.parse(await req.json());
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "invalid_body" },
        { status: 400 },
      );
    }

    const store = createPgVectorStore({
      organizationId: session.organizationId,
      fileId: parsed.fileId,
    });

    const result = await hybridRetrieve({
      query: parsed.query,
      vectorStore: store,
      embed: resolveEmbedder(),
      topK: parsed.topK ?? 8,
    });

    observe("files.search.latency_ms", result.latencyMs, {
      scoped: parsed.fileId ? "file" : "org",
    });
    logger.info(
      {
        org: session.organizationId,
        chunks: result.chunks.length,
        latencyMs: result.latencyMs,
      },
      "api.files.search",
    );

    return NextResponse.json({
      query: result.query,
      latencyMs: result.latencyMs,
      chunks: result.chunks,
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    if (status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    captureError(err, { route: "api/files/search" });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
