/**
 * POST /api/video/generate
 * GET  /api/video/generate   (provider status probe)
 *
 * Kicks off an asynchronous video generation job with the selected
 * provider (Replicate Kling v2, OpenAI Sora, Google Veo). Returns a
 * `{ jobId, status: "processing" }` envelope — the client polls
 * `/api/video/jobs/[id]` until the signed URL is ready.
 *
 * TODO(ai-media-db): persist jobs in `media_jobs` table instead of the
 * in-memory store in lib/media/jobs.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";
import { captureError, incr, logger } from "@sparkflow/observability";
import {
  VIDEO_PROVIDERS,
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
  durationSec: z.number().int().min(2).max(10).optional().default(5),
  size: z.string().optional(),
  negativePrompt: z.string().max(4000).optional(),
});

function jobId(): string {
  return crypto.randomUUID();
}

export async function GET() {
  return NextResponse.json({ providers: providerStatuses(VIDEO_PROVIDERS) });
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

    const provider = findProvider(VIDEO_PROVIDERS, parsed.provider);
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
        durationSec: parsed.durationSec,
        size: parsed.size,
        negativePrompt: parsed.negativePrompt,
        organizationId: session.organizationId,
      })) as AsyncJobResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "provider_error";
      logger.error({ err: message, provider: provider.id }, "api.video.generate.provider_error");
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const id = jobId();
    const job = createJob({
      id,
      kind: "video",
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

    incr("video.started", { provider: provider.id });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      provider: provider.id,
    });
  } catch (err) {
    captureError(err, { route: "api/video/generate" });
    incr("video.error");
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
