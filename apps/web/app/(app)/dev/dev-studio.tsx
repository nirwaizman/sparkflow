"use client";

/**
 * AI Developer studio.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────┐
 *   │  [lang] [template] [entry]          [Run] [ZIP]  │
 *   ├───────┬──────────────────────────┬───────────────┤
 *   │ Files │ Monaco editor            │ AI assistant  │
 *   │ tree  │                          │ (chat +       │
 *   │       │                          │  propose diff)│
 *   └───────┴──────────────────────────┴───────────────┘
 *
 * All state (files, active tab, chat messages, run output) lives in this
 * component. Files are a flat `{path, content}[]` keyed by unique path.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@sparkflow/ui";
import { FileTree, type DevFile } from "@/components/dev/file-tree";
import { Monaco } from "@/components/dev/monaco";
import {
  STARTERS,
  STARTER_META,
  type StarterKey,
} from "@/components/dev/starter-templates";

type Language = "ts" | "js" | "python";

type DiffAction = "create" | "update" | "delete";
type ProposedFile = { path: string; content: string; action: DiffAction };

type ChatMsg =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      diff?: ProposedFile[];
      applied?: boolean;
    };

type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
};

function dedupeByPath(files: DevFile[]): DevFile[] {
  const map = new Map<string, DevFile>();
  for (const f of files) map.set(f.path, f);
  return Array.from(map.values());
}

function applyDiff(files: DevFile[], diff: ProposedFile[]): DevFile[] {
  const map = new Map(files.map((f) => [f.path, f.content]));
  for (const d of diff) {
    if (d.action === "delete") {
      map.delete(d.path);
    } else {
      map.set(d.path, d.content);
    }
  }
  return Array.from(map.entries()).map(([path, content]) => ({ path, content }));
}

export function DevStudio() {
  const [starter, setStarter] = useState<StarterKey>("blank");
  const [language, setLanguage] = useState<Language>(
    STARTER_META.blank.language,
  );
  const [files, setFiles] = useState<DevFile[]>(() =>
    dedupeByPath(STARTERS.blank),
  );
  const [activePath, setActivePath] = useState<string | null>(
    STARTERS.blank[0]?.path ?? null,
  );
  const [entry, setEntry] = useState<string>(STARTER_META.blank.entry);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setGenerating] = useState(false);

  const [runOutput, setRunOutput] = useState<RunResult | null>(null);
  const [isRunning, setRunning] = useState(false);

  const activeFile = useMemo(
    () => files.find((f) => f.path === activePath) ?? null,
    [files, activePath],
  );

  const loadTemplate = useCallback((key: StarterKey) => {
    const tpl = STARTERS[key];
    setStarter(key);
    setFiles(dedupeByPath(tpl));
    setActivePath(tpl[0]?.path ?? null);
    const meta = STARTER_META[key];
    setLanguage(meta.language);
    setEntry(meta.entry);
    setMessages([]);
    setRunOutput(null);
  }, []);

  // Keep `entry` valid when files shift (e.g. after applying a diff that
  // deletes the current entry).
  useEffect(() => {
    if (!files.some((f) => f.path === entry) && files.length > 0) {
      setEntry(files[0]!.path);
    }
  }, [files, entry]);

  const updateActiveContent = useCallback(
    (next: string) => {
      if (!activePath) return;
      setFiles((prev) =>
        prev.map((f) => (f.path === activePath ? { ...f, content: next } : f)),
      );
    },
    [activePath],
  );

  const handleCreate = useCallback((path: string) => {
    setFiles((prev) => {
      if (prev.some((f) => f.path === path)) return prev;
      return [...prev, { path, content: "" }];
    });
    setActivePath(path);
  }, []);

  const handleRename = useCallback(
    (oldPath: string, newPath: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.path === oldPath ? { ...f, path: newPath } : f)),
      );
      setActivePath((cur) => (cur === oldPath ? newPath : cur));
      if (entry === oldPath) setEntry(newPath);
    },
    [entry],
  );

  const handleDelete = useCallback(
    (path: string) => {
      setFiles((prev) => prev.filter((f) => f.path !== path));
      setActivePath((cur) => {
        if (cur !== path) return cur;
        const remaining = files.filter((f) => f.path !== path);
        return remaining[0]?.path ?? null;
      });
    },
    [files],
  );

  const sendPrompt = useCallback(async () => {
    const text = prompt.trim();
    if (!text || isGenerating) return;
    setPrompt("");
    const nextMessages: ChatMsg[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setGenerating(true);
    try {
      const res = await fetch("/api/dev/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          files: files.map((f) => ({ path: f.path, content: f.content })),
          language,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setMessages([
          ...nextMessages,
          { role: "assistant", content: `Error: ${errText}` },
        ]);
        return;
      }
      const data = (await res.json()) as {
        files: ProposedFile[];
        explanation: string;
      };
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.explanation || "(no explanation)",
          diff: data.files,
        },
      ]);
    } catch (err) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setGenerating(false);
    }
  }, [prompt, isGenerating, messages, files, language]);

  const acceptDiff = useCallback(
    (index: number) => {
      setMessages((prev) => {
        const msg = prev[index];
        if (!msg || msg.role !== "assistant" || !msg.diff) return prev;
        setFiles((curr) => applyDiff(curr, msg.diff!));
        return prev.map((m, i) =>
          i === index && m.role === "assistant" ? { ...m, applied: true } : m,
        );
      });
    },
    [],
  );

  const runProject = useCallback(async () => {
    if (isRunning) return;
    setRunning(true);
    setRunOutput(null);
    try {
      const res = await fetch("/api/dev/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          language,
          entry,
          files: files.map((f) => ({ path: f.path, content: f.content })),
        }),
      });
      const data = (await res.json()) as RunResult;
      setRunOutput(data);
    } catch (err) {
      setRunOutput({
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: -1,
      });
    } finally {
      setRunning(false);
    }
  }, [isRunning, language, entry, files]);

  const downloadZip = useCallback(async () => {
    // Dynamic import so jszip isn't in the server bundle.
    // Typed as `any` because the package's types may not be installed yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import("jszip" as any)) as { default: any };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSZipCtor: any = mod.default;
    const zip = new JSZipCtor();
    for (const f of files) {
      zip.file(f.path, f.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${starter}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [files, starter]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="text-xs text-neutral-400">Lang</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
          >
            <option value="ts">TypeScript</option>
            <option value="js">Node.js</option>
            <option value="python">Python</option>
          </select>
        </label>

        <label className="flex items-center gap-1">
          <span className="text-xs text-neutral-400">Template</span>
          <select
            value={starter}
            onChange={(e) => loadTemplate(e.target.value as StarterKey)}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs"
          >
            {(Object.keys(STARTER_META) as StarterKey[]).map((k) => (
              <option key={k} value={k}>
                {STARTER_META[k].label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1">
          <span className="text-xs text-neutral-400">Entry</span>
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className="w-48 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs"
          />
        </label>

        <div className="ms-auto flex items-center gap-2">
          <Button
            onClick={runProject}
            disabled={isRunning || !entry}
            size="sm"
          >
            {isRunning ? "Running…" : "Run"}
          </Button>
          <Button onClick={downloadZip} size="sm" variant="secondary">
            Download .zip
          </Button>
        </div>
      </div>

      {/* Main 3-column area */}
      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_360px]">
        {/* File tree */}
        <div className="min-h-0 border-e border-neutral-800">
          <FileTree
            files={files}
            activePath={activePath}
            onSelect={setActivePath}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        </div>

        {/* Editor + run output */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
            {activeFile ? (
              <span className="font-mono">{activeFile.path}</span>
            ) : (
              <span>No file selected</span>
            )}
          </div>
          <div className="min-h-0 flex-1">
            {activeFile ? (
              <Monaco
                path={activeFile.path}
                value={activeFile.content}
                onChange={updateActiveContent}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                Create or select a file to start editing.
              </div>
            )}
          </div>
          {runOutput && (
            <div className="max-h-48 shrink-0 overflow-auto border-t border-neutral-800 bg-black p-3 font-mono text-xs">
              <div className="mb-1 text-neutral-400">
                exit {runOutput.exitCode}
                {typeof runOutput.durationMs === "number"
                  ? ` · ${runOutput.durationMs}ms`
                  : ""}
              </div>
              {runOutput.stdout && (
                <pre className="whitespace-pre-wrap text-green-300">
                  {runOutput.stdout}
                </pre>
              )}
              {runOutput.stderr && (
                <pre className="whitespace-pre-wrap text-red-300">
                  {runOutput.stderr}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* AI assistant */}
        <div className="flex min-h-0 flex-col border-s border-neutral-800 bg-neutral-900">
          <div className="border-b border-neutral-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
            AI assistant
          </div>
          <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
            {messages.length === 0 && (
              <div className="text-xs text-neutral-500">
                Ask for a change. The assistant reads your current files and
                proposes a diff you can accept.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "rounded bg-neutral-800 p-2"
                    : "rounded border border-neutral-800 p-2"
                }
              >
                <div className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap text-[13px] text-neutral-100">
                  {m.content}
                </div>
                {m.role === "assistant" && m.diff && m.diff.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-[11px] text-neutral-400">
                      Proposed changes ({m.diff.length}):
                    </div>
                    <ul className="mb-2 space-y-0.5 text-[11px]">
                      {m.diff.map((d) => (
                        <li key={d.path} className="font-mono">
                          <span
                            className={
                              d.action === "create"
                                ? "text-green-400"
                                : d.action === "delete"
                                  ? "text-red-400"
                                  : "text-amber-300"
                            }
                          >
                            {d.action[0]?.toUpperCase()}
                          </span>{" "}
                          {d.path}
                        </li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      disabled={m.applied}
                      onClick={() => acceptDiff(i)}
                    >
                      {m.applied ? "Applied" : "Accept & apply"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {isGenerating && (
              <div className="text-xs text-neutral-500">Thinking…</div>
            )}
          </div>
          <div className="border-t border-neutral-800 p-2">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendPrompt();
                }
              }}
              placeholder="Describe a change… (⌘/Ctrl+Enter to send)"
              rows={3}
              className="w-full resize-none rounded border border-neutral-700 bg-neutral-950 p-2 font-mono text-xs text-neutral-100 focus:border-neutral-500 focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <Button
                size="sm"
                onClick={sendPrompt}
                disabled={isGenerating || !prompt.trim()}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
