"use client";

/**
 * Left-hand palette. Each card is a native drag source — we set the
 * `application/sparkflow-node-kind` mime type with the node kind and
 * let the visual editor handle the drop by creating a new node at the
 * flow-space drop position.
 */
import type { DragEvent } from "react";
import type { NodeKind } from "@sparkflow/workflows";
import { DEFAULT_LABELS, NODE_KINDS, NODE_META } from "./node-types";

export const DRAG_MIME = "application/sparkflow-node-kind";

export function NodePalette() {
  function onDragStart(e: DragEvent<HTMLButtonElement>, kind: NodeKind) {
    e.dataTransfer.setData(DRAG_MIME, kind);
    // Legacy fallback — some browsers require at least one "standard" type.
    e.dataTransfer.setData("text/plain", kind);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-white">
      <div className="border-b px-3 py-2">
        <h2 className="text-sm font-semibold text-neutral-900">Nodes</h2>
        <p className="text-xs text-neutral-500">Drag onto the canvas.</p>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {NODE_KINDS.map((kind) => {
          const meta = NODE_META[kind];
          const Icon = meta.icon;
          return (
            <li key={kind}>
              <button
                type="button"
                draggable
                onDragStart={(e) => onDragStart(e, kind)}
                className={[
                  "flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm active:cursor-grabbing",
                  meta.bg,
                  meta.border,
                  "hover:brightness-95",
                ].join(" ")}
                aria-label={`Drag ${DEFAULT_LABELS[kind]} node onto the canvas`}
              >
                <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
                <span className="font-medium text-neutral-800">
                  {DEFAULT_LABELS[kind]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
