"use client";

/**
 * RemoteCursors — overlays every remote peer's cursor + name tag on top
 * of a collaborative surface. Drop this inside a relatively-positioned
 * container and it'll absolutely-position cursors at `(peer.cursor.x,
 * peer.cursor.y)` in the container's coordinate space.
 *
 * The component is purely presentational — it subscribes to the
 * awareness instance you pass in and re-renders on change. The host is
 * responsible for producing a local `awareness` via `createYDoc` and
 * publishing its own cursor with `broadcastCursor`.
 */
import * as React from "react";
import type { Awareness } from "y-protocols/awareness";
import {
  subscribePresence,
  type PresencePeer,
} from "@sparkflow/realtime";

export interface RemoteCursorsProps {
  awareness: Awareness;
  /** Optional className for the overlay container. */
  className?: string;
}

export function RemoteCursors({ awareness, className }: RemoteCursorsProps) {
  const [peers, setPeers] = React.useState<PresencePeer[]>([]);

  React.useEffect(() => {
    return subscribePresence(awareness, setPeers);
  }, [awareness]);

  return (
    <div
      aria-hidden
      className={
        "pointer-events-none absolute inset-0 overflow-hidden " +
        (className ?? "")
      }
    >
      {peers.map((peer) => {
        const cursor = peer.state.cursor;
        const user = peer.state.user;
        if (!cursor || !user) return null;
        return (
          <div
            key={peer.clientId}
            className="absolute transition-transform duration-75 ease-out"
            style={{
              transform: `translate(${cursor.x}px, ${cursor.y}px)`,
            }}
          >
            <svg
              width="14"
              height="20"
              viewBox="0 0 14 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ color: user.color }}
            >
              <path
                d="M0 0L0 15L4 12L6.5 18L9 17L6.5 11L12 11L0 0Z"
                fill="currentColor"
                stroke="white"
                strokeWidth="1"
              />
            </svg>
            <div
              className="mt-0.5 inline-block rounded-sm px-1.5 py-0.5 text-xs font-medium text-white shadow-sm"
              style={{ backgroundColor: user.color }}
            >
              {user.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
