export const dynamic = "force-dynamic";

/**
 * Agent detail page (Server Component).
 *
 * Shows the prompt editor, tools checklist, and a "Run" affordance.
 * For built-in agents the page is effectively read-only — a banner
 * makes this explicit and the client editor disables submission.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4">
        <Link
          href="/agents"
          className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
        >
          ← All agents
        </Link>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{detail.name}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {detail.role} · v{detail.version}
          </p>
        </div>
        <QuickRun agentId={detail.id} agentName={detail.name} />
      </div>

      {detail.builtIn && (
        <div className="mb-4 rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-sm text-amber-100">
          This is a built-in SparkFlow agent. Definition is read-only; to
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
        <h2 className="mb-1 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          System prompt
        </h2>
        <textarea
          readOnly
          value={detail.systemPrompt}
          className="h-48 w-full resize-y rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2 font-mono text-xs"
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
          Tools
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
    </main>
  );
}
