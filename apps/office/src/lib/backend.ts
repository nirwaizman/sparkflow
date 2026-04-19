/**
 * Thin client for the SparkFlow web backend.
 *
 * The backend URL is read from localStorage (key `sparkflow.backendUrl`) so the
 * user can point the add-in at local dev, staging, or production without a
 * rebuild. Defaults to `http://localhost:3001`.
 */

const STORAGE_KEY = "sparkflow.backendUrl";
const DEFAULT_BACKEND = "http://localhost:3001";

export function getBackendUrl(): string {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored && stored.trim().length > 0 ? stored : DEFAULT_BACKEND;
  } catch {
    return DEFAULT_BACKEND;
  }
}

export function setBackendUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // ignore: storage may be unavailable inside some Office host webviews
  }
}

export interface BackendRequest {
  /** Route under the backend, e.g. "word/draft". Leading slash optional. */
  path: string;
  /** JSON-serializable body. */
  body?: unknown;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

export interface BackendResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/**
 * POST JSON to `${backend}/api/${path}` and return the parsed response.
 * Never throws — errors are returned on the result object so UI code stays
 * simple.
 */
export async function callBackend<T = unknown>(req: BackendRequest): Promise<BackendResponse<T>> {
  const base = getBackendUrl().replace(/\/$/, "");
  const path = req.path.replace(/^\//, "");
  const url = `${base}/api/${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: req.signal,
    });

    const text = await res.text();
    let data: T | null = null;
    if (text.length > 0) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        // non-JSON response; leave data null and surface as error below
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: `Backend returned ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
