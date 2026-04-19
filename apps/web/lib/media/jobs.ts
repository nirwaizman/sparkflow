/**
 * In-memory job store for async video/music generation.
 *
 * TODO(ai-media-db): Move to a Postgres-backed `media_jobs` table when the
 * drizzle schema lands. Fields to migrate: id, orgId, userId, kind
 * (video|music), provider, providerJobId, status, storagePath, signedUrl,
 * signedUrlExpiresAt, prompt, createdAt, updatedAt, error.
 *
 * In-memory state has obvious limits: multi-instance deployments won't
 * share job state, and a pod restart drops pending jobs. For the MVP we
 * only need single-pod correctness, and jobs have a short (<10 min) TTL.
 */

export type JobKind = "video" | "music";
export type JobStatus = "processing" | "succeeded" | "failed";

export interface MediaJob {
  id: string;
  kind: JobKind;
  /** Provider id from providers.ts (e.g. "replicate-kling"). */
  providerId: string;
  /** The provider's own job identifier used for polling. */
  providerJobId: string;
  organizationId: string | null;
  userId: string | null;
  prompt: string;
  status: JobStatus;
  storagePath?: string;
  signedUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1h

// Keep a single shared Map across module reloads under dev (Next.js HMR).
const g = globalThis as unknown as { __sparkflow_media_jobs?: Map<string, MediaJob> };
const store: Map<string, MediaJob> = g.__sparkflow_media_jobs ?? new Map();
g.__sparkflow_media_jobs = store;

function gc(): void {
  const now = Date.now();
  for (const [id, job] of store) {
    if (now - job.updatedAt > TTL_MS) store.delete(id);
  }
}

export function createJob(args: Omit<MediaJob, "createdAt" | "updatedAt">): MediaJob {
  gc();
  const now = Date.now();
  const job: MediaJob = { ...args, createdAt: now, updatedAt: now };
  store.set(job.id, job);
  return job;
}

export function getJob(id: string): MediaJob | undefined {
  return store.get(id);
}

export function updateJob(id: string, patch: Partial<MediaJob>): MediaJob | undefined {
  const cur = store.get(id);
  if (!cur) return undefined;
  const next: MediaJob = { ...cur, ...patch, updatedAt: Date.now() };
  store.set(id, next);
  return next;
}
