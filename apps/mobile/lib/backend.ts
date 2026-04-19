import * as SecureStore from "expo-secure-store";

const BACKEND_URL_KEY = "sparkflow.backend.url";
const BACKEND_TOKEN_KEY = "sparkflow.backend.token";

export const DEFAULT_BACKEND_URL = "http://localhost:3000";

export type BackendConfig = {
  url: string;
  token: string | null;
};

export async function getBackendConfig(): Promise<BackendConfig> {
  const [url, token] = await Promise.all([
    SecureStore.getItemAsync(BACKEND_URL_KEY),
    SecureStore.getItemAsync(BACKEND_TOKEN_KEY),
  ]);
  return {
    url: (url && url.trim().length > 0 ? url : DEFAULT_BACKEND_URL).replace(/\/+$/, ""),
    token: token && token.length > 0 ? token : null,
  };
}

export async function setBackendUrl(url: string): Promise<void> {
  const clean = url.trim();
  if (clean.length === 0) {
    await SecureStore.deleteItemAsync(BACKEND_URL_KEY);
    return;
  }
  await SecureStore.setItemAsync(BACKEND_URL_KEY, clean);
}

export async function setBackendToken(token: string): Promise<void> {
  const clean = token.trim();
  if (clean.length === 0) {
    await SecureStore.deleteItemAsync(BACKEND_TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(BACKEND_TOKEN_KEY, clean);
}

export async function clearBackendToken(): Promise<void> {
  await SecureStore.deleteItemAsync(BACKEND_TOKEN_KEY);
}

export type BackendRequestInit = Omit<RequestInit, "headers" | "body"> & {
  headers?: Record<string, string>;
  body?: RequestInit["body"] | Record<string, unknown>;
};

/**
 * Build a full URL against the configured backend.
 */
export async function backendUrl(path: string): Promise<string> {
  const { url } = await getBackendConfig();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${url}${suffix}`;
}

/**
 * fetch() wrapper that injects the base URL and bearer token.
 * Returns the raw Response so callers can stream (for chat) or parse JSON.
 */
export async function backendFetch(
  path: string,
  init: BackendRequestInit = {},
): Promise<Response> {
  const { url, token } = await getBackendConfig();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: RequestInit["body"] | undefined;
  if (init.body != null) {
    if (
      typeof init.body === "string" ||
      init.body instanceof ArrayBuffer ||
      init.body instanceof Uint8Array ||
      (typeof FormData !== "undefined" && init.body instanceof FormData)
    ) {
      body = init.body as RequestInit["body"];
    } else {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(init.body);
    }
  }

  const suffix = path.startsWith("/") ? path : `/${path}`;
  const res = await fetch(`${url}${suffix}`, { ...init, headers, body });
  return res;
}

export async function backendJson<T>(
  path: string,
  init: BackendRequestInit = {},
): Promise<T> {
  const res = await backendFetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}
