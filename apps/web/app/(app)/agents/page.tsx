export const dynamic = "force-dynamic";

/**
 * Agents marketplace (Server Component).
 *
 * Lists the 11 built-in agents + any org-scoped custom agents, grouped
 * by category. Each tile is rendered by `<AgentCard />` and links to
 * the detail page. "Use agent" opens the run drawer via `?run=1`.
 */
import Link from "next/link";
import { eq, isNull, or } from "drizzle-orm";
import { getDb, agents as agentsTable } from "@sparkflow/db";
import { requireSession } from "@sparkflow/auth";
import { Button } from "@sparkflow/ui";
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
import { AgentCard } from "@/components/agents/agent-card";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  categoryOf,
  colorClassesFor,
  iconFor,
  type AgentCategory,
} from "@/components/agents/category-icon";

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

type CardModel = {
  id: string;
  name: string;
  role: string;
  objective: string;
  tools: string[];
  builtIn: boolean;
  version?: number;
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

  const cards: CardModel[] = [
    ...BUILT_INS.map<CardModel>((d) => ({
      id: `builtin:${d.id}`,
      name: d.name,
      role: d.role,
      objective: d.objective,
      tools: d.tools,
      builtIn: true,
    })),
    ...Array.from(latest.values()).map<CardModel>((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      objective: r.description ?? "",
      tools: Array.isArray(r.tools) ? (r.tools as string[]) : [],
      builtIn: false,
      version: r.version,
    })),
  ];

  // Bucket into categories preserving source order within each group.
  const buckets = new Map<AgentCategory, CardModel[]>();
  for (const cat of CATEGORY_ORDER) buckets.set(cat, []);
  for (const c of cards) {
    const cat = categoryOf({ id: c.id, name: c.name, role: c.role });
    buckets.get(cat)!.push(c);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Pick a ready-made SparkFlow agent or compose your own.
          </p>
        </div>
        <Button asChild>
          <Link href="/agents/new">New agent</Link>
        </Button>
      </div>

      <div className="flex flex-col gap-10">
        {CATEGORY_ORDER.map((cat) => {
          const items = buckets.get(cat) ?? [];
          if (items.length === 0) return null;
          const Icon = iconFor(cat);
          const colors = colorClassesFor(cat);
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`}>
              <header className="mb-3 flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${colors.badge}`}
                  aria-hidden
                >
                  <Icon className="h-4 w-4" />
                </div>
                <h2
                  id={`cat-${cat}`}
                  className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"
                >
                  {CATEGORY_LABEL[cat]}
                </h2>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  · {items.length}
                </span>
              </header>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((card) => (
                  <li key={card.id}>
                    <AgentCard
                      id={card.id}
                      name={card.name}
                      role={card.role}
                      objective={card.objective}
                      tools={card.tools}
                      builtIn={card.builtIn}
                      version={card.version}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
