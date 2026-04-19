"use client";

/**
 * Workflow editor entrypoint — visual react-flow canvas.
 *
 * Historical note: this file used to be a JSON textarea (the WP-C5
 * scaffold) with a localValidate() preflight. The full editor
 * (WP-C5.1) replaces the textarea with <VisualEditor />. The JSON
 * shape remains the source of truth so the API contract
 * (POST /api/workflows with `{name, graph, trigger}`) is unchanged;
 * power users can still reach raw JSON via the editor's
 * Import JSON / Export JSON menu.
 */
import { useState } from "react";
import { VisualEditor } from "@/components/workflows/visual-editor";

export function WorkflowEditor() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
      >
        New workflow
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border px-3 py-1 text-xs"
        >
          Close editor
        </button>
      </div>
      <VisualEditor />
    </div>
  );
}
