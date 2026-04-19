export const dynamic = "force-dynamic";

/**
 * Agent detail (Server Component).
 *
 * For built-in agents the system prompt + tools are read-only. For
 * org-scoped custom agents we show the latest version; inline editing
 * of the prompt + versioned saves will ship in a follow-up, but the
 * page surfaces the current version and a note indicating how new
 * versions are produced.
 *
 * Supports `?run=1` to auto-open the QuickRun drawer on mount.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Badge } from "@sparkflow/ui";
import { getDb, agents as agentsTable } from "@sparkflow/db";
import { requireSession } from "@sparkflow/auth";
import {
  analystAgent,
  coderAgent,
  criticAgent,
  fileAgent,
  monetizationAgent,
  plannerAgent,
  researchAgent,
  securityAgent,
  taskExecutorAgent,
  uxAgent,
  writerAgent,
  type AgentDefinition,
} from "@sparkflow/agents";
import { registerCoreTools, registry } from "@sparkflow/tools";
import { QuickRun } from "../quick-run";
import {
  categoryOf,
  colorClassesFor,
  iconForAgentId,
} from "@/components/agents/category-icon";

registerCoreTools(registry);

const BUILT_INS: Record<string, AgentDefinition> = {
  research: researchAgent,
  analyst: analystAgent,
  writer: writerAgent,
  coder: coderAgent,
  file: fileAgent,
  "task-executor": taskExecutorAgent,
  critic: criticAgent,
  planner: plannerAgent,
  monetization: monetizationAgent,
  ux: uxAgent,
  security: securityAgent,
};

type Detail = {
  id: string;
  name: string;
  role: string;
  description: string | null;
  systemPrompt: string;
  tools: string[];
  memoryScope: string;
  model: string | null;
  version: number;
  builtIn: boolean;
};

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  const qs = (await searchParams) ?? {};
  const runParam = qs.run;
  const autoOpenRun = runParam === "1" || runParam === "true";

  const id = decodeURIComponent(rawId);
  const session = await requireSession();

  let detail: Detail | null = null;

  if (id.startsWith("builtin:")) {
    const def = BUILT_INS[id.slice("builtin:".length)];
    if (!def) notFound();
    detail = {
      id,
      name: def.name,
      role: def.role,
      description: def.objective,
      systemPrompt: def.systemPrompt,
      tools: def.tools,
      memoryScope: def.memoryScope,
      model: def.model ?? null,
      version: 1,
      builtIn: true,
    };
  } else {
    const db = getDb();
    const [row] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, id))
      .orderBy(desc(agentsTable.version))
      .limit(1);
    if (!row) notFound();
    if (row.organizationId && row.organizationId !== session.organizationId) {
      notFound();
    }
    detail = {
      id: row.id,
      name: row.name,
      role: row.role,
      description: row.description,
      systemPrompt: row.systemPrompt,
      tools: Array.isArray(row.tools) ? (row.tools as string[]) : [],
      memoryScope: row.memoryScope,
      model: row.model,
      version: row.version,
      builtIn: false,
    };
  }

  const allTools = registry.list().map((r) => r.tool.name);
  const category = categoryOf({
    id: detail.id,
    name: detail.name,
    role: detail.role,
  });
  const colors = colorClassesFor(category);
  const Icon = iconForAgentId(detail.id);

  return (
    <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4">
          <Link
            href="/agents"
            className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
          >
            ← All agents
          </Link>
        </div>

        <header className="mb-6 flex items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${colors.badge}`}
            aria-hidden
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{detail.name}</h1>
              {detail.builtIn ? (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  Built-in
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                  Custom · v{detail.version}
                </Badge>
              )}
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {detail.role}
            </p>
          </div>
        </header>

        {detail.builtIn && (
          <div className="mb-4 rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-100">
            This is a built-in SparkFlow agent. Its definition is read-only; to
            customise it, clone it via{" "}
            <Link href="/agents/new" className="underline">
              New agent
            </Link>
            .
          </div>
        )}

        {detail.description && (
          <section className="mb-6">
            <h2 className="mb-1 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              Objective
            </h2>
            <p className="text-sm">{detail.description}</p>
          </section>
        )}

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
            Tools
          </h2>
          {detail.tools.length === 0 ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Pure-reasoning agent — no tools bound.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {detail.tools.map((t) => (
                <Badge key={t} variant="outline" className="font-mono text-[11px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section className="mb-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              System prompt
            </h2>
            {!detail.builtIn && (
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                Saving creates v{detail.version + 1} (append-only history).
              </span>
            )}
          </div>
          <textarea
            readOnly
            value={detail.systemPrompt}
            className="h-60 w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 font-mono text-xs"
          />
        </section>

        <section className="mb-6">
          <h2 className="mb-1 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
            Available tool registry
          </h2>
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {allTools.map((t) => (
              <li key={t} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={detail.tools.includes(t)}
                  readOnly
                  disabled
                  className="accent-brand-600"
                />
                <span className="font-mono">{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="mb-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              Memory scope
            </h3>
            <p>{detail.memoryScope}</p>
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              Model
            </h3>
            <p>{detail.model ?? "(gateway default)"}</p>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <h2 className="mb-2 text-sm font-semibold">Quick run</h2>
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Send a one-off prompt to this agent and stream its response.
          </p>
          <QuickRun
            agentId={detail.id}
            agentName={detail.name}
            autoOpen={autoOpenRun}
            triggerLabel="Open run drawer"
          />
        </div>
      </aside>
    </main>
  );
}
