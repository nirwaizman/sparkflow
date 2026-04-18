"use client";

/**
 * New-agent form (Client Component).
 *
 * POSTs to `/api/agents`. The tool list is fetched once on mount from
 * `/api/agents` (which eagerly registers core tools on the server), so
 * we avoid shipping a hard-coded list down to the client.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CORE_TOOL_NAMES = [
  "search_web",
  "scrape_url",
  "summarize_text",
  "generate_text",
  "run_code",
  "parse_file",
  "retrieve_memory",
  "save_memory",
  "generate_image",
  "create_document",
  "export_file",
] as const;

type MemoryScope = "session" | "user" | "workspace" | "global";

export default function NewAgentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [memoryScope, setMemoryScope] = useState<MemoryScope>("session");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolNames, setToolNames] = useState<string[]>([...CORE_TOOL_NAMES]);

  useEffect(() => {
    // Refresh the canonical tool list from the server once. Not fatal
    // on failure — we already have a hard-coded fallback above.
    fetch("/api/agents")
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as {
          agents?: { tools: string[]; builtIn: boolean }[];
        };
        const acc = new Set<string>(CORE_TOOL_NAMES);
        for (const a of data.agents ?? []) {
          for (const t of a.tools) acc.add(t);
        }
        setToolNames(Array.from(acc).sort());
      })
      .catch(() => {});
  }, []);

  const toggleTool = (t: string) =>
    setTools((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          description: description || undefined,
          systemPrompt,
          tools,
          memoryScope,
          model: model || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { agent: { id: string } };
      router.push(`/agents/${data.agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">New agent</h1>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Role
          </label>
          <input
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
            placeholder="e.g. Senior research analyst"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-20 w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            System prompt
          </label>
          <textarea
            required
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="h-40 w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 font-mono text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Tools
          </label>
          <ul className="grid grid-cols-2 gap-1 rounded-md border border-[hsl(var(--border))] p-2 sm:grid-cols-3">
            {toolNames.map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  id={`tool-${t}`}
                  checked={tools.includes(t)}
                  onChange={() => toggleTool(t)}
                  className="accent-brand-600"
                />
                <label htmlFor={`tool-${t}`} className="font-mono">
                  {t}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              Memory scope
            </label>
            <select
              value={memoryScope}
              onChange={(e) => setMemoryScope(e.target.value as MemoryScope)}
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
            >
              <option value="session">session</option>
              <option value="user">user</option>
              <option value="workspace">workspace</option>
              <option value="global">global</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              Model (optional)
            </label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gateway default"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
            />
          </div>
        </div>
        {error && (
          <p className="rounded-md border border-red-700/40 bg-red-900/20 p-2 text-xs text-red-200">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push("/agents")}
            className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create agent"}
          </button>
        </div>
      </form>
    </main>
  );
}
