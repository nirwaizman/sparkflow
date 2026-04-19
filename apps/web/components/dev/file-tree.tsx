"use client";

/**
 * Minimal file tree for the AI Developer studio.
 *
 * Files are modeled as a flat list keyed by `path` (POSIX, no leading slash).
 * We render a simple grouped-by-folder view with create/rename/delete.
 */
import { useMemo, useState } from "react";

export type DevFile = { path: string; content: string };

type FileTreeProps = {
  files: DevFile[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onCreate: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
  onDelete: (path: string) => void;
};

type TreeNode =
  | { kind: "file"; name: string; path: string }
  | { kind: "dir"; name: string; path: string; children: TreeNode[] };

function buildTree(files: DevFile[]): TreeNode[] {
  const root: TreeNode = { kind: "dir", name: "", path: "", children: [] };
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = f.path.split("/").filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const isLeaf = i === parts.length - 1;
      const partialPath = parts.slice(0, i + 1).join("/");
      if (isLeaf) {
        cur.children.push({ kind: "file", name, path: f.path });
      } else {
        let dir = cur.children.find(
          (c) => c.kind === "dir" && c.name === name,
        ) as Extract<TreeNode, { kind: "dir" }> | undefined;
        if (!dir) {
          dir = { kind: "dir", name, path: partialPath, children: [] };
          cur.children.push(dir);
        }
        cur = dir;
      }
    }
  }
  // sort: dirs first
  const sort = (n: TreeNode) => {
    if (n.kind === "dir") {
      n.children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sort);
    }
  };
  sort(root);
  return root.children;
}

function NodeRow({
  node,
  depth,
  activePath,
  onSelect,
  onRename,
  onDelete,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  onSelect: (p: string) => void;
  onRename: (oldP: string, newP: string) => void;
  onDelete: (p: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (node.kind === "dir") {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1 px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
          style={{ paddingInlineStart: 8 + depth * 12 }}
        >
          <span className="text-neutral-500">{open ? "▾" : "▸"}</span>
          <span className="truncate">{node.name}/</span>
        </button>
        {open && (
          <div>
            {node.children.map((c) => (
              <NodeRow
                key={c.path}
                node={c}
                depth={depth + 1}
                activePath={activePath}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  const active = node.path === activePath;
  return (
    <div
      className={`group flex items-center justify-between gap-1 px-2 py-1 text-xs ${
        active
          ? "bg-neutral-800 text-white"
          : "text-neutral-300 hover:bg-neutral-800/60"
      }`}
      style={{ paddingInlineStart: 20 + depth * 12 }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className="min-w-0 flex-1 truncate text-left"
        title={node.path}
      >
        {node.name}
      </button>
      <div className="hidden gap-1 group-hover:flex">
        <button
          type="button"
          onClick={() => {
            const next = window.prompt("Rename to:", node.path);
            if (next && next !== node.path) onRename(node.path, next);
          }}
          className="text-[10px] text-neutral-400 hover:text-white"
          aria-label={`Rename ${node.path}`}
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${node.path}?`)) onDelete(node.path);
          }}
          className="text-[10px] text-neutral-400 hover:text-red-400"
          aria-label={`Delete ${node.path}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function FileTree({
  files,
  activePath,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-900 text-neutral-200">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Files
        </span>
        <button
          type="button"
          onClick={() => {
            const path = window.prompt(
              "New file path (e.g. src/hello.ts):",
              "src/new-file.ts",
            );
            if (path) onCreate(path);
          }}
          className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {tree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-neutral-500">
            No files yet.
          </div>
        ) : (
          tree.map((n) => (
            <NodeRow
              key={n.path}
              node={n}
              depth={0}
              activePath={activePath}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
