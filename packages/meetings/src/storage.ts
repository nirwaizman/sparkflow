/**
 * Supabase Storage helper for the `meetings` bucket.
 *
 * Server-only — relies on the service-role key to bypass RLS. Imports
 * `@supabase/supabase-js` dynamically so consumers that never call these
 * helpers (e.g. summariser-only test code) don't pay the cost of pulling
 * the module into their bundle.
 *
 * The bucket is auto-created on first write so the app works on a fresh
 * Supabase project without a manual dashboard step.
 */
import { assertEnv, optionalEnv } from "@sparkflow/shared";
// The `@supabase/supabase-js` package is a peer of the web app; packages
// that import this module must have it installed. We intentionally do not
// declare it as a dep of `@sparkflow/meetings` so non-web consumers (CLI
// scripts, tests) can tree-shake this file out.
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "meetings";

let _client: SupabaseClient | null = null;
let _bucketEnsured = false;

async function serviceClient(): Promise<SupabaseClient> {
  if (_client) return _client;
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL") ?? assertEnv("SUPABASE_URL");
  const key = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const { createClient } = await import("@supabase/supabase-js");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function meetingsBucket(): string {
  return BUCKET;
}

async function ensureBucket(): Promise<void> {
  if (_bucketEnsured) return;
  const client = await serviceClient();
  const { data: existing } = await client.storage.getBucket(BUCKET);
  if (!existing) {
    await client.storage.createBucket(BUCKET, { public: false });
  }
  _bucketEnsured = true;
}

export interface UploadArgs {
  key: string;
  contentType: string;
  body: Buffer;
}

export async function uploadMeetingAudio(args: UploadArgs): Promise<{ path: string }> {
  await ensureBucket();
  const client = await serviceClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .upload(args.key, args.body, {
      contentType: args.contentType,
      upsert: false,
    });
  if (error || !data) {
    throw new Error(`meetings.upload failed: ${error?.message ?? "unknown"}`);
  }
  return { path: data.path };
}

export async function downloadMeetingAudio(path: string): Promise<Buffer> {
  const client = await serviceClient();
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`meetings.download failed: ${error?.message ?? "unknown"}`);
  }
  const arrayBuf = await data.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function getMeetingSignedUrl(
  path: string,
  expiresIn = 600,
): Promise<string> {
  const client = await serviceClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    throw new Error(`meetings.signUrl failed: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}
