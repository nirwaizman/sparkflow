/**
 * Typed registry of AI media providers for Image, Video and Music.
 *
 * Each provider exposes:
 *   - `id`            — stable string used by the API + UI
 *   - `name`          — human-readable label for the picker
 *   - `envVar`        — required env var for configuration checks
 *   - `isConfigured()` — runtime guard so the UI can disable buttons
 *   - `generate()`    — the actual provider call
 *
 * IMAGE providers return inline results. VIDEO/MUSIC providers may return
 * a pending job (`{ status: "processing", providerJobId }`) that the
 * polling endpoint later resolves.
 */
import { fetchAndUpload, uploadMedia, type MediaBucket } from "./storage";

// ---------- Shared types ----------

export interface GenerateOptions {
  prompt: string;
  /** Image size or aspect. Provider-specific; e.g. "1024x1024" or "16:9". */
  size?: string;
  /** Video/music duration in seconds. */
  durationSec?: number;
  /** Negative prompt (image/video). */
  negativePrompt?: string;
  /** Genre hint for music. */
  genre?: string;
  /** Number of variants, if the provider supports it. Images only. */
  n?: number;
  /** Organization id — used to scope the storage key. */
  organizationId?: string;
}

export interface ImageResult {
  kind: "image";
  images: Array<{
    url: string;
    storagePath: string | null;
    revisedPrompt?: string;
    b64_json?: string;
  }>;
}

export interface AsyncJobResult {
  kind: "async";
  status: "processing" | "succeeded" | "failed";
  providerJobId: string;
  /** When `succeeded`: where we uploaded the asset. */
  storagePath?: string;
  signedUrl?: string;
  error?: string;
}

export type MediaResult = ImageResult | AsyncJobResult;

export interface MediaProvider {
  id: string;
  name: string;
  envVar: string;
  bucket: MediaBucket;
  isConfigured: () => boolean;
  generate: (opts: GenerateOptions) => Promise<MediaResult>;
  /**
   * Optional poller for async providers. Returns a terminal state or keeps
   * reporting `processing`. Only meaningful for video/music providers.
   */
  poll?: (providerJobId: string, orgId?: string) => Promise<AsyncJobResult>;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function uuid(): string {
  return crypto.randomUUID();
}

// =====================================================================
// IMAGE PROVIDERS
// =====================================================================

// ---- OpenAI gpt-image-1 ----

interface OpenAiImageResponse {
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
}

async function openaiImageGenerate(opts: GenerateOptions): Promise<ImageResult> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const payload: Record<string, unknown> = {
    model: "gpt-image-1",
    prompt: opts.prompt,
    size: opts.size ?? "1024x1024",
    n: opts.n ?? 1,
    quality: "medium",
  };

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openai.images ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as OpenAiImageResponse;

  const images: ImageResult["images"] = [];
  for (const item of data.data ?? []) {
    if (item.b64_json) {
      images.push({
        url: `data:image/png;base64,${item.b64_json}`,
        storagePath: null,
        revisedPrompt: item.revised_prompt,
        b64_json: item.b64_json,
      });
    } else if (item.url) {
      images.push({
        url: item.url,
        storagePath: null,
        revisedPrompt: item.revised_prompt,
      });
    }
  }
  return { kind: "image", images };
}

// ---- Replicate flux-1.1-pro-ultra ----

async function replicateRun(args: {
  model: string;
  input: Record<string, unknown>;
}): Promise<unknown> {
  const token = env("REPLICATE_API_TOKEN");
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  // "Run" endpoint: start prediction then poll. We cap wait to ~90s here;
  // for video we go async through the /jobs endpoint instead.
  const create = await fetch(`https://api.replicate.com/v1/models/${args.model}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      prefer: "wait=60",
    },
    body: JSON.stringify({ input: args.input }),
  });
  if (!create.ok) {
    const text = await create.text().catch(() => "");
    throw new Error(`replicate.create ${create.status}: ${text.slice(0, 500)}`);
  }
  let prediction = (await create.json()) as {
    id: string;
    status: string;
    output?: unknown;
    error?: string;
    urls?: { get: string };
  };

  // If the `prefer: wait` header succeeded, we might already be done.
  const deadline = Date.now() + 90_000;
  while (
    prediction.status !== "succeeded" &&
    prediction.status !== "failed" &&
    prediction.status !== "canceled" &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollUrl =
      prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
    const next = await fetch(pollUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!next.ok) break;
    prediction = (await next.json()) as typeof prediction;
  }
  if (prediction.status !== "succeeded") {
    throw new Error(`replicate ${args.model} ${prediction.status}: ${prediction.error ?? ""}`);
  }
  return prediction.output;
}

async function replicateImageGenerate(opts: GenerateOptions): Promise<ImageResult> {
  const output = await replicateRun({
    model: "black-forest-labs/flux-1.1-pro-ultra",
    input: {
      prompt: opts.prompt,
      aspect_ratio: opts.size ?? "1:1",
      output_format: "png",
      safety_tolerance: 2,
      ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
    },
  });
  // Replicate returns either a string URL or array of URLs.
  const urls: string[] = Array.isArray(output)
    ? (output as string[])
    : typeof output === "string"
      ? [output]
      : [];

  const images: ImageResult["images"] = [];
  for (const url of urls) {
    if (opts.organizationId) {
      try {
        const { path, signedUrl } = await fetchAndUpload({
          bucket: "images",
          key: `${opts.organizationId}/${uuid()}.png`,
          sourceUrl: url,
          contentType: "image/png",
        });
        images.push({ url: signedUrl, storagePath: path });
      } catch {
        images.push({ url, storagePath: null });
      }
    } else {
      images.push({ url, storagePath: null });
    }
  }
  return { kind: "image", images };
}

// ---- Google Imagen 4 ----

async function googleImagenGenerate(opts: GenerateOptions): Promise<ImageResult> {
  const apiKey = env("GOOGLE_GENERATIVE_AI_API_KEY");
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");

  // Imagen 4 via the Generative Language REST API.
  const model = "imagen-4.0-generate-001";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
  const body = {
    instances: [{ prompt: opts.prompt }],
    parameters: {
      sampleCount: opts.n ?? 1,
      aspectRatio: opts.size ?? "1:1",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google.imagen ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };

  const images: ImageResult["images"] = [];
  for (const p of data.predictions ?? []) {
    const b64 = p.bytesBase64Encoded;
    if (!b64) continue;
    const mime = p.mimeType ?? "image/png";
    if (opts.organizationId) {
      try {
        const { path, signedUrl } = await uploadMedia({
          bucket: "images",
          key: `${opts.organizationId}/${uuid()}.png`,
          contentType: mime,
          body: Buffer.from(b64, "base64"),
        });
        images.push({ url: signedUrl, storagePath: path });
      } catch {
        images.push({ url: `data:${mime};base64,${b64}`, storagePath: null, b64_json: b64 });
      }
    } else {
      images.push({
        url: `data:${mime};base64,${b64}`,
        storagePath: null,
        b64_json: b64,
      });
    }
  }
  return { kind: "image", images };
}

export const IMAGE_PROVIDERS: MediaProvider[] = [
  {
    id: "openai",
    name: "OpenAI gpt-image-1",
    envVar: "OPENAI_API_KEY",
    bucket: "images",
    isConfigured: () => Boolean(env("OPENAI_API_KEY")),
    generate: openaiImageGenerate,
  },
  {
    id: "replicate",
    name: "Replicate FLUX 1.1 Pro Ultra",
    envVar: "REPLICATE_API_TOKEN",
    bucket: "images",
    isConfigured: () => Boolean(env("REPLICATE_API_TOKEN")),
    generate: replicateImageGenerate,
  },
  {
    id: "google",
    name: "Google Imagen 4",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    bucket: "images",
    isConfigured: () => Boolean(env("GOOGLE_GENERATIVE_AI_API_KEY")),
    generate: googleImagenGenerate,
  },
];

// =====================================================================
// VIDEO PROVIDERS (async)
// =====================================================================

async function replicateStartVideo(args: {
  model: string;
  input: Record<string, unknown>;
}): Promise<string> {
  const token = env("REPLICATE_API_TOKEN");
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  const res = await fetch(`https://api.replicate.com/v1/models/${args.model}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ input: args.input }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`replicate.create ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function replicatePollVideo(predictionId: string): Promise<{
  status: "processing" | "succeeded" | "failed";
  url?: string;
  error?: string;
}> {
  const token = env("REPLICATE_API_TOKEN");
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { status: "failed", error: `poll ${res.status}` };
  }
  const data = (await res.json()) as {
    status: string;
    output?: unknown;
    error?: string;
  };
  if (data.status === "succeeded") {
    const output = data.output;
    const url = Array.isArray(output)
      ? (output[0] as string)
      : typeof output === "string"
        ? output
        : undefined;
    return { status: "succeeded", url };
  }
  if (data.status === "failed" || data.status === "canceled") {
    return { status: "failed", error: data.error ?? data.status };
  }
  return { status: "processing" };
}

// ---- Replicate Kling v2 ----

const klingVideoProvider: MediaProvider = {
  id: "replicate-kling",
  name: "Replicate Kling v2",
  envVar: "REPLICATE_API_TOKEN",
  bucket: "videos",
  isConfigured: () => Boolean(env("REPLICATE_API_TOKEN")),
  async generate(opts): Promise<AsyncJobResult> {
    const id = await replicateStartVideo({
      model: "kwaivgi/kling-v2.0",
      input: {
        prompt: opts.prompt,
        duration: Math.min(Math.max(opts.durationSec ?? 5, 2), 10),
        aspect_ratio: opts.size ?? "16:9",
        ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
      },
    });
    return { kind: "async", status: "processing", providerJobId: id };
  },
  async poll(providerJobId, orgId): Promise<AsyncJobResult> {
    const p = await replicatePollVideo(providerJobId);
    if (p.status !== "succeeded") {
      return { kind: "async", status: p.status, providerJobId, error: p.error };
    }
    if (!p.url) {
      return { kind: "async", status: "failed", providerJobId, error: "no output url" };
    }
    const key = `${orgId ?? "anon"}/${uuid()}.mp4`;
    const { path, signedUrl } = await fetchAndUpload({
      bucket: "videos",
      key,
      sourceUrl: p.url,
      contentType: "video/mp4",
    });
    return {
      kind: "async",
      status: "succeeded",
      providerJobId,
      storagePath: path,
      signedUrl,
    };
  },
};

// ---- OpenAI Sora (sora-2) ----

interface OpenAiVideoJob {
  id: string;
  status: string;
  error?: { message?: string };
}

const openaiSoraProvider: MediaProvider = {
  id: "openai-sora",
  name: "OpenAI Sora",
  envVar: "OPENAI_API_KEY",
  bucket: "videos",
  isConfigured: () => Boolean(env("OPENAI_API_KEY")),
  async generate(opts): Promise<AsyncJobResult> {
    const apiKey = env("OPENAI_API_KEY")!;
    // NOTE: The Sora API surface is still evolving. We target the
    // `/v1/videos` endpoint with `model: "sora-2"`. If OpenAI returns a
    // 404 (model not yet GA for this key), the error bubbles up and the
    // UI surfaces the friendly message.
    const res = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "sora-2",
        prompt: opts.prompt,
        size: opts.size ?? "1280x720",
        seconds: String(opts.durationSec ?? 5),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404 || res.status === 400) {
        throw new Error(
          `Sora is not available for this account yet — try another provider. (${res.status})`,
        );
      }
      throw new Error(`openai.videos ${res.status}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as OpenAiVideoJob;
    return { kind: "async", status: "processing", providerJobId: data.id };
  },
  async poll(providerJobId, orgId): Promise<AsyncJobResult> {
    const apiKey = env("OPENAI_API_KEY")!;
    const res = await fetch(`https://api.openai.com/v1/videos/${providerJobId}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: `openai.videos.get ${res.status}`,
      };
    }
    const data = (await res.json()) as OpenAiVideoJob;
    if (data.status === "queued" || data.status === "in_progress") {
      return { kind: "async", status: "processing", providerJobId };
    }
    if (data.status !== "completed" && data.status !== "succeeded") {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: data.error?.message ?? data.status,
      };
    }
    // Content endpoint streams the mp4.
    const contentRes = await fetch(
      `https://api.openai.com/v1/videos/${providerJobId}/content`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    if (!contentRes.ok) {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: `openai.videos.content ${contentRes.status}`,
      };
    }
    const buf = Buffer.from(await contentRes.arrayBuffer());
    const { path, signedUrl } = await uploadMedia({
      bucket: "videos",
      key: `${orgId ?? "anon"}/${uuid()}.mp4`,
      contentType: "video/mp4",
      body: buf,
    });
    return {
      kind: "async",
      status: "succeeded",
      providerJobId,
      storagePath: path,
      signedUrl,
    };
  },
};

// ---- Google Veo ----

interface GoogleVeoOperation {
  name: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };
}

const googleVeoProvider: MediaProvider = {
  id: "google-veo",
  name: "Google Veo",
  envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
  bucket: "videos",
  isConfigured: () => Boolean(env("GOOGLE_GENERATIVE_AI_API_KEY")),
  async generate(opts): Promise<AsyncJobResult> {
    const apiKey = env("GOOGLE_GENERATIVE_AI_API_KEY")!;
    // `veo-3.0-generate-preview` is the most recent preview model at time of
    // writing; if unavailable, Google returns 4xx and we surface it.
    const model = "veo-3.0-generate-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: {
          aspectRatio: opts.size ?? "16:9",
          durationSeconds: opts.durationSec ?? 5,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`google.veo ${res.status}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as { name: string };
    return { kind: "async", status: "processing", providerJobId: data.name };
  },
  async poll(providerJobId, orgId): Promise<AsyncJobResult> {
    const apiKey = env("GOOGLE_GENERATIVE_AI_API_KEY")!;
    // providerJobId is the full operation name, e.g. "operations/abc123".
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${providerJobId}?key=${apiKey}`,
    );
    if (!res.ok) {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: `google.veo.op ${res.status}`,
      };
    }
    const op = (await res.json()) as GoogleVeoOperation;
    if (!op.done) return { kind: "async", status: "processing", providerJobId };
    if (op.error) {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: op.error.message ?? "veo failed",
      };
    }
    const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: "veo returned no video uri",
      };
    }
    // Veo URIs require the API key appended.
    const signedSource = videoUri.includes("?")
      ? `${videoUri}&key=${apiKey}`
      : `${videoUri}?key=${apiKey}`;
    const { path, signedUrl } = await fetchAndUpload({
      bucket: "videos",
      key: `${orgId ?? "anon"}/${uuid()}.mp4`,
      sourceUrl: signedSource,
      contentType: "video/mp4",
    });
    return {
      kind: "async",
      status: "succeeded",
      providerJobId,
      storagePath: path,
      signedUrl,
    };
  },
};

export const VIDEO_PROVIDERS: MediaProvider[] = [
  klingVideoProvider,
  openaiSoraProvider,
  googleVeoProvider,
];

// =====================================================================
// MUSIC PROVIDERS (async)
// =====================================================================

// ---- Suno ----

interface SunoClip {
  id: string;
  status: string;
  audio_url?: string;
  error_message?: string;
}

const sunoProvider: MediaProvider = {
  id: "suno",
  name: "Suno",
  envVar: "SUNO_API_KEY",
  bucket: "audio",
  isConfigured: () => Boolean(env("SUNO_API_KEY")),
  async generate(opts): Promise<AsyncJobResult> {
    const apiKey = env("SUNO_API_KEY")!;
    // There is no single canonical Suno REST API; most third-party
    // wrappers expose `/api/generate`. We use the widely-used
    // `api.sunoapi.org` surface.
    const res = await fetch("https://api.sunoapi.org/api/v1/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        customMode: false,
        instrumental: false,
        ...(opts.genre ? { tags: opts.genre } : {}),
        model: "V4",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`suno ${res.status}: ${text.slice(0, 500)}`);
    }
    const data = (await res.json()) as { data?: { taskId?: string }; taskId?: string };
    const taskId = data.data?.taskId ?? data.taskId;
    if (!taskId) throw new Error("suno: no taskId in response");
    return { kind: "async", status: "processing", providerJobId: taskId };
  },
  async poll(providerJobId, orgId): Promise<AsyncJobResult> {
    const apiKey = env("SUNO_API_KEY")!;
    const res = await fetch(
      `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${providerJobId}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: `suno.record-info ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      data?: { status?: string; response?: { sunoData?: SunoClip[] } };
    };
    const status = data.data?.status ?? "";
    const clip = data.data?.response?.sunoData?.[0];
    if (clip?.audio_url && (status === "SUCCESS" || status === "COMPLETE")) {
      const { path, signedUrl } = await fetchAndUpload({
        bucket: "audio",
        key: `${orgId ?? "anon"}/${uuid()}.mp3`,
        sourceUrl: clip.audio_url,
        contentType: "audio/mpeg",
      });
      return {
        kind: "async",
        status: "succeeded",
        providerJobId,
        storagePath: path,
        signedUrl,
      };
    }
    if (status === "FAILED" || status === "ERROR") {
      return {
        kind: "async",
        status: "failed",
        providerJobId,
        error: clip?.error_message ?? "suno failed",
      };
    }
    return { kind: "async", status: "processing", providerJobId };
  },
};

// ---- ElevenLabs ----

const elevenLabsProvider: MediaProvider = {
  id: "elevenlabs",
  name: "ElevenLabs Music",
  envVar: "ELEVENLABS_API_KEY",
  bucket: "audio",
  isConfigured: () => Boolean(env("ELEVENLABS_API_KEY")),
  async generate(opts): Promise<AsyncJobResult> {
    const apiKey = env("ELEVENLABS_API_KEY")!;
    const duration = opts.durationSec ?? 10;
    // Prefer the dedicated /v1/music endpoint for longer clips; fall back
    // to sound-generation for short (<=22s) snippets since the music
    // endpoint is not available on every tier.
    const useMusic = duration > 22;
    const endpoint = useMusic
      ? "https://api.elevenlabs.io/v1/music"
      : "https://api.elevenlabs.io/v1/sound-generation";
    const body = useMusic
      ? {
          prompt: opts.prompt + (opts.genre ? `, genre: ${opts.genre}` : ""),
          music_length_ms: Math.min(duration, 300) * 1000,
        }
      : {
          text: opts.prompt + (opts.genre ? `, ${opts.genre}` : ""),
          duration_seconds: Math.min(duration, 22),
          prompt_influence: 0.5,
        };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (!useMusic && res.status === 404) {
        throw new Error("ElevenLabs sound-generation not enabled for this key");
      }
      if (useMusic && (res.status === 404 || res.status === 403)) {
        throw new Error(
          "ElevenLabs /v1/music unavailable — try shortening to <=22s for sound-generation fallback.",
        );
      }
      throw new Error(`elevenlabs ${res.status}: ${text.slice(0, 500)}`);
    }
    // ElevenLabs returns the audio synchronously. We upload and return a
    // "succeeded" async result so the UI can reuse the polling path.
    const buf = Buffer.from(await res.arrayBuffer());
    const jobId = uuid();
    const { path, signedUrl } = await uploadMedia({
      bucket: "audio",
      key: `${opts.organizationId ?? "anon"}/${jobId}.mp3`,
      contentType: "audio/mpeg",
      body: buf,
    });
    return {
      kind: "async",
      status: "succeeded",
      providerJobId: jobId,
      storagePath: path,
      signedUrl,
    };
  },
  async poll(providerJobId): Promise<AsyncJobResult> {
    // ElevenLabs was synchronous on generate; poll is a no-op that reports
    // the job as already-succeeded. The route layer stores the final
    // signedUrl/storagePath on the job record before anyone polls.
    return { kind: "async", status: "succeeded", providerJobId };
  },
};

export const MUSIC_PROVIDERS: MediaProvider[] = [sunoProvider, elevenLabsProvider];

// =====================================================================
// Helpers
// =====================================================================

export function findProvider(
  list: MediaProvider[],
  id: string | undefined,
): MediaProvider | undefined {
  if (!id) return list[0];
  return list.find((p) => p.id === id);
}

export function providerStatuses(list: MediaProvider[]): Array<{
  id: string;
  name: string;
  envVar: string;
  configured: boolean;
}> {
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    envVar: p.envVar,
    configured: p.isConfigured(),
  }));
}
