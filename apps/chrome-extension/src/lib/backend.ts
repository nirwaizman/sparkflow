// Backend fetch wrapper shared by popup, options, and side panel.
// Reads backend URL + token + default model from chrome.storage.local,
// and exposes a streaming `chatStream` helper for the side panel chat.

export interface BackendSettings {
  backendUrl: string;
  token: string;
  defaultModel: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatStreamRequest {
  messages: ChatMessage[];
  model?: string;
  /** Optional page context captured from the active tab. */
  context?: {
    url?: string;
    selection?: string;
  };
}

const STORAGE_KEY = "sparkflow.settings";
const DEFAULTS: BackendSettings = {
  backendUrl: "https://app.sparkflow.ai",
  token: "",
  defaultModel: "sparkflow-default",
};

export async function getSettings(): Promise<BackendSettings> {
  const raw = (await chrome.storage.local.get(STORAGE_KEY)) as Record<
    string,
    unknown
  >;
  const stored = raw[STORAGE_KEY];
  if (stored && typeof stored === "object") {
    const s = stored as Partial<BackendSettings>;
    return {
      backendUrl: s.backendUrl?.trim() || DEFAULTS.backendUrl,
      token: s.token ?? "",
      defaultModel: s.defaultModel?.trim() || DEFAULTS.defaultModel,
    };
  }
  return { ...DEFAULTS };
}

export async function saveSettings(next: BackendSettings): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      backendUrl: next.backendUrl.trim().replace(/\/$/, ""),
      token: next.token.trim(),
      defaultModel: next.defaultModel.trim() || DEFAULTS.defaultModel,
    },
  });
}

function buildHeaders(settings: BackendSettings): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "X-SparkFlow-Client": "chrome-extension",
  };
  if (settings.token) {
    headers["Authorization"] = `Bearer ${settings.token}`;
  }
  return headers;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * POST a non-streaming JSON request to the backend. Used for small actions
 * from the popup (e.g. summarize current page).
 */
export async function apiFetch<TBody, TResp>(
  path: string,
  body: TBody,
  init?: { method?: string; signal?: AbortSignal }
): Promise<TResp> {
  const settings = await getSettings();
  const res = await fetch(joinUrl(settings.backendUrl, path), {
    method: init?.method ?? "POST",
    headers: buildHeaders(settings),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: init?.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `SparkFlow ${res.status}: ${text || res.statusText}`.trim()
    );
  }
  return (await res.json()) as TResp;
}

/**
 * Stream a chat completion from `/api/chat/stream`. Yields assistant text
 * deltas as they arrive. The backend is expected to send Server-Sent Events
 * with lines shaped as `data: {"delta":"..."}` and a terminating `data: [DONE]`.
 */
export async function* chatStream(
  request: ChatStreamRequest,
  signal?: AbortSignal
): AsyncGenerator<string, void, void> {
  const settings = await getSettings();
  const res = await fetch(joinUrl(settings.backendUrl, "/api/chat/stream"), {
    method: "POST",
    headers: buildHeaders(settings),
    body: JSON.stringify({
      model: request.model ?? settings.defaultModel,
      messages: request.messages,
      context: request.context,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `SparkFlow ${res.status}: ${text || res.statusText}`.trim()
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { delta?: string; content?: string };
            const delta = parsed.delta ?? parsed.content ?? "";
            if (delta) yield delta;
          } catch {
            // Non-JSON payload — forward raw text.
            yield payload;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
