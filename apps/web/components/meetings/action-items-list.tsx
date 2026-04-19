"use client";

/**
 * Interactive action-items checklist.
 *
 * Check state is persisted to localStorage keyed by `meetingId:index` so it
 * survives reloads without a round-trip to the server. Once the meetings
 * table lands we can promote this into a POST endpoint.
 */
import { useEffect, useState } from "react";
import type { ActionItem } from "@sparkflow/meetings";

export function ActionItemsList({
  meetingId,
  items,
}: {
  meetingId: string;
  items: ActionItem[];
}) {
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`meeting-actions:${meetingId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as boolean[];
      if (Array.isArray(parsed) && parsed.length === items.length) {
        setChecked(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [meetingId, items.length]);

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      try {
        localStorage.setItem(`meeting-actions:${meetingId}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        No action items were identified.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const done = checked[i] ?? false;
        const meta: string[] = [];
        if (item.assignee) meta.push(`@${item.assignee}`);
        if (item.dueDate) meta.push(`due ${item.dueDate}`);
        return (
          <li key={i} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 cursor-pointer"
              checked={done}
              onChange={() => toggle(i)}
              aria-label={`Mark "${item.text}" as done`}
            />
            <div className="flex-1">
              <span className={done ? "line-through text-[hsl(var(--muted-foreground))]" : ""}>
                {item.text}
              </span>
              {meta.length > 0 ? (
                <span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
                  ({meta.join(", ")})
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
