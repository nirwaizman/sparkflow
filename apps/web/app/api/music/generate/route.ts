/**
 * POST /api/music/generate
 * GET  /api/music/generate   (provider status probe)
 *
 * Starts a music generation job (Suno or ElevenLabs). Suno is fully
 * async; ElevenLabs is synchronous under the hood but we normalize
 * both to the same `{ jobId, status }` envelope so the UI uses one
 * polling loop.
 *
 * TODO(ai-media-db): persist jobs in `media_jobs` table.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";
import { captureError, incr, logger } from "@sparkflow/observability";
import {
  MUSIC_PROVIDERS,
  findProvider,
  providerStatuses,
  type AsyncJobResult,
} from "@/lib/media/providers";
import { createJob } from "@/lib/media/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  provider: z.string().optional(),
  genre: z.string().max(100).optional(),
  durationSec: z.number().int().min(5).max(300).optional().default(30),
});

function jobId(): string {
  return crypto.randomUUID();
}

export async function GET() {
  return NextResponse.json({ providers: providerStatuses(MUSIC_PROVIDERS) });
}

export async function POST(request: NextRequest) {
  try {
    let session: Awaited<ReturnType<typeof requireSession>>;
    try {
      session = await requireSession();
    } catch {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = bodySchema.parse(json);

    const provider = findProvider(MUSIC_PROVIDERS, parsed.provider);
    if (!provider) {
      return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
    }
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: `provider_not_configured:${provider.envVar}` },
        { status: 400 },
      );
    }

    let startResult: AsyncJobResult;
    try {
      startResult = (await provider.generate({
        prompt: parsed.prompt,
        genre: parsed.genre,
        durationSec: parsed.durationSec,
        organizationId: session.organizationId,
      })) as AsyncJobResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "provider_error";
      logger.error({ err: message, provider: provider.id }, "api.music.generate.provider_error");
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const id = jobId();
    const job = createJob({
      id,
      kind: "music",
      providerId: provider.id,
      providerJobId: startResult.providerJobId,
      organizationId: session.organizationId,
      userId: session.user.id,
      prompt: parsed.prompt,
      status: startResult.status,
      storagePath: startResult.storagePath,
      signedUrl: startResult.signedUrl,
      error: startResult.error,
    });

    incr("music.started", { provider: provider.id });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      provider: provider.id,
      url: job.signedUrl ?? null,
    });
  } catch (err) {
    captureError(err, { route: "api/music/generate" });
    incr("music.error");
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
