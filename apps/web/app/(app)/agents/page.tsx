export const dynamic = "force-dynamic";

/**
 * Agents listing page (Server Component).
 *
 * Shows a grid of built-in + org-scoped custom agents. Each card links
 * to the detail page and opens a quick-run modal (`QuickRun`, a client
 * component that streams SSE events from `/api/agents/[id]/run`).
 */
import Link from "next/link";
import { eq, isNull, or } from "drizzle-orm";
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
import { QuickRun } from "./quick-run";

const BUILT_INS: AgentDefinition[] = [
  researchAgent,
  analystAgent,
  writerAgent,
  coderAgent,
  fileAgent,
  taskExecutorAgent,
  criticAgent,
  plannerAgent,
  monetizationAgent,
  uxAgent,
  securityAgent,
];

type Card = {
  id: string;
  name: string;
  role: string;
  description: string;
  tools: string[];
  builtIn: boolean;
};

export default async function AgentsPage() {
  const session = await requireSession();
  const db = getDb();

  const rows = await db
    .select()
    .from(agentsTable)
    .where(
      or(
        isNull(agentsTable.organizationId),
        eq(agentsTable.organizationId, session.organizationId),
      ),
    );

  // Collapse to the latest version per (org, name).
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.organizationId ?? "global"}::${r.name}`;
    const ex = latest.get(key);
    if (!ex || r.version > ex.version) latest.set(key, r);
  }

  const cards: Card[] = [
    ...BUILT_INS.map((d) => ({
      id: `builtin:${d.id}`,
      name: d.name,
      role: d.role,
      description: d.objective,
      tools: d.tools,
      builtIn: true,
    })),
    ...Array.from(latest.values()).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      description: r.description ?? "",
      tools: Array.isArray(r.tools) ? (r.tools as string[]) : [],
      builtIn: false,
    })),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Built-in SparkFlow agents plus custom ones defined for your
            workspace.
          </p>
        </div>
        <Link
          href="/agents/new"
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
        >
          New agent
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <li
            key={card.id}
            className="flex flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">{card.name}</h2>
              {card.builtIn && (
                <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                  built-in
                </span>
              )}
            </div>
            <p className="mb-1 text-xs text-[hsl(var(--muted-foreground))]">
              {card.role}
            </p>
            <p className="mb-3 line-clamp-3 text-sm">{card.description}</p>
            {card.tools.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {card.tools.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-auto flex items-center gap-2">
              <Link
                href={`/agents/${encodeURIComponent(card.id)}`}
                className="rounded-md border border-[hsl(var(--border))] px-2.5 py-1 text-xs hover:bg-[hsl(var(--muted))]"
              >
                Details
              </Link>
              <QuickRun agentId={card.id} agentName={card.name} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
