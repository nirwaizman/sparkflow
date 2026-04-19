"use client";

/**
 * New-agent form (Client Component).
 *
 * POSTs to `/api/agents`. The tool list is fetched once on mount from
 * `/api/agents` (which eagerly registers core tools on the server), so
 * we avoid shipping a hard-coded list down to the client.
 *
 * Enhancements:
 *  - "Copy from built-in" selector prefills the form from any shipped
 *    built-in agent returned by `/api/agents` (distinguished by the
 *    `builtIn: true` flag, see `apps/web/app/api/agents/route.ts`).
 *  - Inline validation hints (length bounds, required fields).
 *  - "Test run" streams a prompt through the new definition without
 *    persisting the row, by POSTing directly to `/api/agents/run-adhoc`
 *    when available. If that endpoint doesn't exist yet the button
 *    falls back to saving first and redirecting to the detail page.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

type AgentDto = {
  id: string;
  name: string;
  role: string;
  description: string | null;
  systemPrompt: string;
  tools: string[];
  memoryScope: MemoryScope;
  model: string | null;
  builtIn: boolean;
};

const NAME_MIN = 1;
const NAME_MAX = 120;
const ROLE_MAX = 120;
const DESCRIPTION_MAX = 2000;
const PROMPT_MIN = 20;

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
  const [builtIns, setBuiltIns] = useState<AgentDto[]>([]);
  const [copyFromId, setCopyFromId] = useState("");
  const [testOutput, setTestOutput] = useState<string>("");
  const [testRunning, setTestRunning] = useState(false);
  const [testPrompt, setTestPrompt] = useState("");

  useEffect(() => {
    // Refresh the canonical tool list + built-in agents once. Not
    // fatal on failure — we already have a hard-coded tool fallback.
    fetch("/api/agents")
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { agents?: AgentDto[] };
        const agents = data.agents ?? [];
        const acc = new Set<string>(CORE_TOOL_NAMES);
        for (const a of agents) {
          for (const t of a.tools) acc.add(t);
        }
        setToolNames(Array.from(acc).sort());
        setBuiltIns(agents.filter((a) => a.builtIn));
      })
      .catch(() => {});
  }, []);

  const toggleTool = (t: string) =>
    setTools((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );

  const applyCopyFrom = (id: string) => {
    setCopyFromId(id);
    if (!id) return;
    const src = builtIns.find((b) => b.id === id);
    if (!src) return;
    setName(`${src.name} (copy)`);
    setRole(src.role);
    setDescription(src.description ?? "");
    setSystemPrompt(src.systemPrompt);
    setTools(src.tools);
    setMemoryScope(src.memoryScope);
    setModel(src.model ?? "");
  };

  const validation = useMemo(() => {
    const issues: Record<string, string> = {};
    if (name.trim().length < NAME_MIN) issues.name = "Name is required.";
    else if (name.length > NAME_MAX) issues.name = `Max ${NAME_MAX} chars.`;
    if (role.trim().length === 0) issues.role = "Role is required.";
    else if (role.length > ROLE_MAX) issues.role = `Max ${ROLE_MAX} chars.`;
    if (description.length > DESCRIPTION_MAX) {
      issues.description = `Max ${DESCRIPTION_MAX} chars.`;
    }
    if (systemPrompt.trim().length === 0) {
      issues.systemPrompt = "System prompt is required.";
    } else if (systemPrompt.trim().length < PROMPT_MIN) {
      issues.systemPrompt = `Prompt is very short — aim for at least ${PROMPT_MIN} characters.`;
    }
    return issues;
  }, [name, role, description, systemPrompt]);

  const canSubmit =
    !submitting &&
    !validation.name &&
    !validation.role &&
    !validation.description &&
    !validation.systemPrompt;

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

  // Streams a single prompt against the draft agent definition without
  // persisting it. Tries the ad-hoc endpoint first; if that 404s we
  // fall back to a helpful message pointing at "Save & test".
  const testRun = async () => {
    if (testRunning) return;
    if (!testPrompt.trim()) {
      setTestOutput("Enter a prompt to test.");
      return;
    }
    setTestRunning(true);
    setTestOutput("");
    try {
      const res = await fetch("/api/agents/run-adhoc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: testPrompt,
          definition: {
            id: "draft",
            name: name || "Draft agent",
            role: role || "draft",
            objective: description || "",
            systemPrompt,
            tools,
            memoryScope,
            model: model || undefined,
          },
        }),
      });
      if (res.status === 404) {
        setTestOutput(
          "Ad-hoc test run endpoint isn't deployed yet. Save the agent first, then open the detail page to try it.",
        );
        return;
      }
      if (!res.ok || !res.body) {
        setTestOutput(`HTTP ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice("data:".length).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload) as
              | { type: "token"; payload: { delta: string } }
              | { type: string; payload: unknown };
            if (evt.type === "token") {
              assembled += (evt as { payload: { delta: string } }).payload.delta;
              setTestOutput(assembled);
            }
          } catch {
            // ignore malformed frames
          }
        }
      }
    } catch (err) {
      setTestOutput(err instanceof Error ? err.message : String(err));
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold">New agent</h1>
      <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
        Define a custom agent for your workspace. Start from scratch or copy a
        built-in and tweak it.
      </p>

      <div className="mb-6 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
        <label
          className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]"
          htmlFor="copy-from"
        >
          Copy from built-in
        </label>
        <select
          id="copy-from"
          value={copyFromId}
          onChange={(e) => applyCopyFrom(e.target.value)}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
        >
          <option value="">— Start from scratch —</option>
          {builtIns.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.role}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
          Selecting a built-in overwrites the form fields below.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
          />
          <div className="mt-1 flex justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className={validation.name ? "text-red-400" : ""}>
              {validation.name ?? "Short, unique within your workspace."}
            </span>
            <span>
              {name.length}/{NAME_MAX}
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Role
          </label>
          <input
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={ROLE_MAX}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
            placeholder="e.g. Senior research analyst"
          />
          <div className="mt-1 flex justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className={validation.role ? "text-red-400" : ""}>
              {validation.role ?? "One-line persona used in the marketplace."}
            </span>
            <span>
              {role.length}/{ROLE_MAX}
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            className="h-20 w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
          />
          <div className="mt-1 flex justify-between text-[11px] text-[hsl(var(--muted-foreground))]">
            <span className={validation.description ? "text-red-400" : ""}>
              {validation.description ?? "What this agent should achieve. 2-line summary on cards."}
            </span>
            <span>
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </div>
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
          <p
            className={`mt-1 text-[11px] ${
              validation.systemPrompt ? "text-red-400" : "text-[hsl(var(--muted-foreground))]"
            }`}
          >
            {validation.systemPrompt ??
              "Injected on every turn. Be explicit about tone, tools, and refusal policy."}
          </p>
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
          <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
            {tools.length === 0
              ? "No tools selected — agent will be pure-reasoning."
              : `${tools.length} tool${tools.length === 1 ? "" : "s"} selected.`}
          </p>
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

        <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold">Test run (dry, does not save)</h2>
            <button
              type="button"
              onClick={testRun}
              disabled={testRunning || !systemPrompt.trim()}
              className="rounded-md border border-[hsl(var(--border))] px-2.5 py-1 text-xs hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              {testRunning ? "Running…" : "Run once"}
            </button>
          </div>
          <textarea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="What should this draft agent do?"
            className="mb-2 h-20 w-full resize-none rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-sm"
          />
          <div className="max-h-48 min-h-[3rem] overflow-y-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 text-xs">
            {testOutput ? (
              <pre className="whitespace-pre-wrap break-words">{testOutput}</pre>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">
                Output will stream here.
              </p>
            )}
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
            disabled={!canSubmit}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create agent"}
          </button>
        </div>
      </form>
    </main>
  );
}
