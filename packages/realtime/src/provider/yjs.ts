/**
 * Yjs document + websocket provider factory.
 *
 * Browser-only. `createYDoc` is what React components call to attach to a
 * collaborative room. It wires:
 *   - a fresh `Y.Doc` scoped to the given `roomId`;
 *   - a `y-websocket` provider pointed at the broker URL;
 *   - the provider's `awareness` instance, used by `@sparkflow/realtime/presence`
 *     for cursor + selection broadcasts.
 *
 * The broker URL is resolved from (in priority order):
 *   1. `opts.url`                          — explicit override (tests, SSR).
 *   2. `process.env.NEXT_PUBLIC_REALTIME_WS_URL` — prod config.
 *   3. `ws://localhost:1234`               — dev default (matches the
 *      standalone server shipped under `apps/realtime-server`).
 *
 * The `token` is appended to the query string so the broker can validate
 * it against whatever auth scheme we choose (Supabase JWT, signed share
 * link, etc). The default broker simply forwards; validation lives server
 * side.
 */
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";

export interface CreateYDocOptions {
  /** Room identifier. Anything stable and per-resource works: `conversation:<uuid>`. */
  roomId: string;
  /** Auth token (Supabase JWT or share-link token). Forwarded as `?token=…`. */
  token?: string;
  /** Override the broker URL. Falls back to env + localhost. */
  url?: string;
  /**
   * If `false`, the provider is created but not connected. Useful when we
   * want to SSR a document and hydrate on the client. Defaults to `true`.
   */
  connect?: boolean;
  /**
   * Initial awareness state. Merged into the provider's awareness immediately
   * so remote peers see us as soon as we join.
   */
  initialPresence?: Record<string, unknown>;
}

export interface YDocHandle {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: Awareness;
  /**
   * Cleanly detach: clears local awareness state, closes the socket, destroys
   * the `Y.Doc`. Idempotent.
   */
  destroy: () => void;
}

function resolveBrokerUrl(explicit?: string): string {
  if (explicit) return explicit;
  const env =
    typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_REALTIME_WS_URL
      : undefined;
  if (env && env.length > 0) return env;
  return "ws://localhost:1234";
}

export function createYDoc(opts: CreateYDocOptions): YDocHandle {
  const { roomId, token, url, connect = true, initialPresence } = opts;

  const doc = new Y.Doc();
  const brokerUrl = resolveBrokerUrl(url);

  // y-websocket appends `/roomName` to the base URL automatically. We pass
  // the token through `params` so it surfaces as a query string the broker
  // can read without us having to re-encode the URL ourselves.
  const provider = new WebsocketProvider(brokerUrl, roomId, doc, {
    connect,
    params: token ? { token } : undefined,
  });

  const awareness = provider.awareness;
  if (initialPresence) {
    for (const [k, v] of Object.entries(initialPresence)) {
      awareness.setLocalStateField(k, v);
    }
  }

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    try {
      awareness.setLocalState(null);
    } catch {
      // awareness may already be torn down; ignore.
    }
    try {
      provider.disconnect();
      provider.destroy();
    } catch {
      // ignore double-destroy
    }
    doc.destroy();
  };

  return { doc, provider, awareness, destroy };
}
