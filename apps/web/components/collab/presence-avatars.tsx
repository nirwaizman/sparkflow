"use client";

/**
 * PresenceAvatars — stack of active peers for a room. Shown in the top
 * bar of any page that participates in a realtime room. Hover reveals
 * each peer's display name.
 *
 * Keeps the stack bounded (`max` prop, defaults to 4). Overflow collapses
 * into a "+N" chip. The local user is intentionally not rendered here —
 * their identity is already in the app shell.
 */
import * as React from "react";
import type { Awareness } from "y-protocols/awareness";
import {
  subscribePresence,
  type PresencePeer,
} from "@sparkflow/realtime";

export interface PresenceAvatarsProps {
  awareness: Awareness;
  /** Maximum visible avatars before collapsing into "+N". Default 4. */
  max?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function PresenceAvatars({
  awareness,
  max = 4,
  className,
}: PresenceAvatarsProps) {
  const [peers, setPeers] = React.useState<PresencePeer[]>([]);

  React.useEffect(() => {
    return subscribePresence(awareness, setPeers);
  }, [awareness]);

  const withUser = peers.filter((p) => p.state.user);
  const visible = withUser.slice(0, max);
  const overflow = withUser.length - visible.length;

  if (withUser.length === 0) return null;

  return (
    <div
      className={"flex items-center -space-x-2 " + (className ?? "")}
      aria-label={`${withUser.length} other user${withUser.length === 1 ? "" : "s"} online`}
    >
      {visible.map((peer) => {
        const user = peer.state.user!;
        return (
          <div
            key={peer.clientId}
            title={user.name}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[hsl(var(--background))] text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: user.color }}
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              initials(user.name)
            )}
          </div>
        );
      })}
      {overflow > 0 ? (
        <div
          title={`${overflow} more`}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--muted))] text-[11px] font-semibold text-[hsl(var(--muted-foreground))]"
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
