/**
 * POST /api/image/generate
 *
 * Generates images via the selected provider (OpenAI gpt-image-1,
 * Replicate flux-1.1-pro-ultra, or Google Imagen 4) and persists each
 * returned image into the Supabase Storage `images` bucket at
 * `{org}/{uuid}.png`. Returns signed URLs plus the storage path so the
 * client can download + share.
 *
 * Honors the `x-guest-mode: 1` bypass for parity with /api/chat. Guests
 * still get generated images but they are NOT persisted to storage
 * (no org to scope them under).
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";
import { withLlmTrace, incr, captureError, logger } from "@sparkflow/observability";
import { getDb, files } from "@sparkflow/db";
import {
  IMAGE_PROVIDERS,
  findProvider,
  providerStatuses,
  type ImageResult,
} from "@/lib/media/providers";
import { uploadMedia } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGES_BUCKET = "images";

const bodySchema = z.object({
  prompt: z.string().min(1).max(4000),
  size: z.string().optional(),
  n: z.number().int().min(1).max(4).optional().default(1),
  negativePrompt: z.string().max(4000).optional(),
  provider: z.enum(["openai", "replicate", "google"]).optional().default("openai"),
  // Kept for OpenAI backwards-compat (ignored by other providers).
  style: z.enum(["vivid", "natural"]).optional(),
  quality: z.enum(["low", "medium", "high"]).optional().default("medium"),
});

function uuid(): string {
  return crypto.randomUUID();
}

export async function GET() {
  // Lightweight capability probe so the UI can render disabled buttons +
  // tooltips without calling POST.
  return NextResponse.json({ providers: providerStatuses(IMAGE_PROVIDERS) });
}

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    let session: Awaited<ReturnType<typeof requireSession>> | null = null;
    if (!guestMode) {
      try {
        session = await requireSession();
      } catch {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const json = await request.json();
    const parsed = bodySchema.parse(json);

    const provider = findProvider(IMAGE_PROVIDERS, parsed.provider);
    if (!provider) {
      return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
    }
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: `provider_not_configured:${provider.envVar}` },
        { status: 400 },
      );
    }

    const result: ImageResult = (await withLlmTrace(
      "image",
      {
        model: provider.id,
        input: parsed.prompt,
        tags: ["image", `provider:${provider.id}`, `size:${parsed.size ?? "default"}`],
      },
      () =>
        provider.generate({
          prompt: parsed.prompt,
          size: parsed.size,
          n: parsed.n,
          negativePrompt: parsed.negativePrompt,
          organizationId: session?.organizationId,
        }),
    )) as ImageResult;

    const out: Array<{ url: string; storagePath: string | null; revisedPrompt?: string }> = [];

    for (const item of result.images) {
      // If the provider already uploaded (replicate/google branches hand
      // back a storagePath), just re-emit.
      if (item.storagePath) {
        out.push({
          url: item.url,
          storagePath: item.storagePath,
          revisedPrompt: item.revisedPrompt,
        });
        if (session) {
          try {
            const db = getDb();
            await db.insert(files).values({
              organizationId: session.organizationId,
              userId: session.user.id,
              name: `image-${new Date().toISOString()}.png`,
              mime: "image/png",
              sizeBytes: 0,
              storagePath: item.storagePath,
              sha256: "",
              status: "ready",
            });
          } catch (err) {
            logger.error(
              { err: err instanceof Error ? err.message : String(err) },
              "api.image.generate.files_insert_failed",
            );
          }
        }
        continue;
      }

      // Otherwise (OpenAI path returns base64), persist now for logged-in
      // users; guests get the data URL back as-is.
      if (item.b64_json && session) {
        const buffer = Buffer.from(item.b64_json, "base64");
        try {
          const { path, signedUrl } = await uploadMedia({
            bucket: IMAGES_BUCKET,
            key: `${session.organizationId}/${uuid()}.png`,
            contentType: "image/png",
            body: buffer,
          });
          try {
            const db = getDb();
            await db.insert(files).values({
              organizationId: session.organizationId,
              userId: session.user.id,
              name: `image-${new Date().toISOString()}.png`,
              mime: "image/png",
              sizeBytes: buffer.byteLength,
              storagePath: path,
              sha256: "",
              status: "ready",
            });
          } catch (err) {
            logger.error(
              { err: err instanceof Error ? err.message : String(err) },
              "api.image.generate.files_insert_failed",
            );
          }
          out.push({ url: signedUrl, storagePath: path, revisedPrompt: item.revisedPrompt });
        } catch (err) {
          logger.error(
            { err: err instanceof Error ? err.message : String(err) },
            "api.image.generate.upload_failed",
          );
          out.push({
            url: item.url,
            storagePath: null,
            revisedPrompt: item.revisedPrompt,
          });
        }
      } else {
        out.push({
          url: item.url,
          storagePath: null,
          revisedPrompt: item.revisedPrompt,
        });
      }
    }

    incr("image.generated", { provider: provider.id });

    return NextResponse.json({ images: out, provider: provider.id });
  } catch (err) {
    captureError(err, { route: "api/image/generate" });
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "api.image.generate.failed",
    );
    incr("image.error");
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
