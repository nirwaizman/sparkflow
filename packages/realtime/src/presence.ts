/**
 * Presence helpers — thin wrappers over Yjs `awareness` for the two
 * pieces of presence we care about at the product level: cursor
 * positions and text selections.
 *
 * Awareness is a CRDT-ish ephemeral state map keyed by `clientID`. Each
 * peer publishes a small JSON blob; remote peers observe the
 * `awareness-update` event and render avatars/cursors from the snapshot.
 *
 * We keep the shape minimal and namespaced so multiple features can
 * coexist on the same awareness map without clobbering each other:
 *
 *   user     : { id, name, color }       — identity chip
 *   cursor   : { x, y } | null           — pixel-space cursor overlay
 *   selection: { anchor, head } | null   — text selection (opaque offsets)
 *
 * All setters accept `null` to clear the field without removing the
 * whole local state.
 */
import type { Awareness } from "y-protocols/awareness";

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface TextSelection {
  /** Opaque start offset — caller decides the coordinate system. */
  anchor: number;
  /** Opaque end offset. Equal to `anchor` for a collapsed cursor. */
  head: number;
}

export interface PresenceState {
  user?: PresenceUser;
  cursor?: CursorPosition | null;
  selection?: TextSelection | null;
  [k: string]: unknown;
}

export interface PresencePeer {
  clientId: number;
  state: PresenceState;
}

/**
 * Stable palette for peer colors. We hash the user id into one of these
 * so the same user gets the same color across sessions. Indexes chosen
 * to stay readable on both light and dark shells.
 */
const PRESENCE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

export function colorForUser(userId: string): string {
  // Cheap, deterministic hash — we don't need crypto quality here.
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % PRESENCE_COLORS.length;
  // Non-null assertion is safe: `idx` is always within bounds of a
  // non-empty const tuple.
  return PRESENCE_COLORS[idx] as string;
}

/** Publish (or overwrite) the local user identity. Call once on join. */
export function setLocalUser(awareness: Awareness, user: PresenceUser): void {
  awareness.setLocalStateField("user", user);
}

/** Publish a cursor position. Pass `null` to hide the cursor. */
export function broadcastCursor(
  awareness: Awareness,
  position: CursorPosition | null,
): void {
  awareness.setLocalStateField("cursor", position);
}

/** Publish a text selection. Pass `null` to clear. */
export function broadcastSelection(
  awareness: Awareness,
  selection: TextSelection | null,
): void {
  awareness.setLocalStateField("selection", selection);
}

/**
 * Snapshot every peer currently in the room, excluding our own client.
 * Call inside an `awareness-update` handler to re-render overlays.
 */
export function listPeers(awareness: Awareness): PresencePeer[] {
  const out: PresencePeer[] = [];
  const self = awareness.clientID;
  const states = awareness.getStates() as Map<number, PresenceState>;
  states.forEach((state, clientId) => {
    if (clientId === self) return;
    out.push({ clientId, state });
  });
  return out;
}

/**
 * Subscribe to awareness changes. Returns an unsubscribe function. The
 * handler receives the full peer list each time anything changes — easier
 * to reason about in React than the raw added/updated/removed triple.
 */
export function subscribePresence(
  awareness: Awareness,
  handler: (peers: PresencePeer[]) => void,
): () => void {
  const listener = () => {
    handler(listPeers(awareness));
  };
  awareness.on("change", listener);
  // Fire once so subscribers start with the current snapshot.
  listener();
  return () => {
    awareness.off("change", listener);
  };
}
