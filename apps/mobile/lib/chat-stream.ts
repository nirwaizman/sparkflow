import { backendFetch } from "./backend";

/**
 * Vercel AI SDK "data stream protocol" is a newline-delimited stream where
 * each line looks like `<TYPE>:<JSON_PAYLOAD>`. We only need a subset here:
 *
 *   0: "text chunk"        -> append to the assistant message
 *   2: [...tool parts]     -> ignored for now (kept for future)
 *   3: "error message"     -> surface as onError
 *   d: { finishReason }    -> end of message
 *   e: { ... }             -> end of step (ignored)
 *
 * If the backend ever switches to raw SSE (`data: ...\n\n`) we still tolerate
 * it: any line prefixed with `data:` is treated the same as a `0:` text chunk
 * after JSON-decoding if possible.
 */

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatStreamHandlers = {
  onToken?: (token: string) => void;
  onError?: (err: Error) => void;
  onFinish?: () => void;
};

export type ChatStreamOptions = ChatStreamHandlers & {
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** Optional override; defaults to `/api/chat/stream`. */
  path?: string;
};

export async function streamChat(opts: ChatStreamOptions): Promise<void> {
  const {
    messages,
    signal,
    path = "/api/chat/stream",
    onToken,
    onError,
    onFinish,
  } = opts;

  let res: Response;
  try {
    res = await backendFetch(path, {
      method: "POST",
      headers: { Accept: "text/event-stream" },
      body: { messages },
      signal,
    });
  } catch (err) {
    onError?.(toError(err));
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    onError?.(new Error(`Chat ${res.status} ${res.statusText}: ${text}`));
    return;
  }

  const body = res.body;
  if (!body) {
    // Some RN fetch polyfills buffer the whole response. Fall back to text.
    const text = await res.text();
    if (text) onToken?.(text);
    onFinish?.();
    return;
  }

  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    // Read until the stream closes.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx !== -1) {
        const rawLine = buffer.slice(0, newlineIdx).replace(/\r$/, "");
        buffer = buffer.slice(newlineIdx + 1);
        if (rawLine.length > 0) handleLine(rawLine, onToken, onError);
        newlineIdx = buffer.indexOf("\n");
      }
    }
    // Flush any trailing partial line.
    const tail = buffer.trim();
    if (tail.length > 0) handleLine(tail, onToken, onError);
    onFinish?.();
  } catch (err) {
    onError?.(toError(err));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* noop */
    }
  }
}

function handleLine(
  line: string,
  onToken: ChatStreamHandlers["onToken"],
  onError: ChatStreamHandlers["onError"],
): void {
  // SSE-style fallback: `data: <payload>`
  if (line.startsWith("data:")) {
    const payload = line.slice(5).trimStart();
    if (payload === "[DONE]") return;
    onToken?.(tryUnwrapJsonString(payload));
    return;
  }

  // Data-stream protocol: `<code>:<json>`
  const colon = line.indexOf(":");
  if (colon <= 0) {
    // Unknown shape - pass through verbatim so debugging is possible.
    onToken?.(line);
    return;
  }
  const code = line.slice(0, colon);
  const payload = line.slice(colon + 1);

  switch (code) {
    case "0": {
      onToken?.(tryUnwrapJsonString(payload));
      return;
    }
    case "3": {
      onError?.(new Error(tryUnwrapJsonString(payload)));
      return;
    }
    case "d":
    case "e":
    case "2":
    case "8":
    case "9":
    case "a":
    case "b":
    case "c":
    case "f": {
      // Metadata / tool / finish frames — ignored for v1.
      return;
    }
    default: {
      // Unknown frame — ignore instead of surfacing noise.
      return;
    }
  }
}

function tryUnwrapJsonString(payload: string): string {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed === "string") return parsed;
    return payload;
  } catch {
    return payload;
  }
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error");
}
