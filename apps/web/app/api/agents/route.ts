/**
 * /api/agents — list + create agents.
 *
 * GET: returns the union of built-in platform agents (shipped by
 *      `@sparkflow/agents`) and org-scoped custom rows from the
 *      `agents` table.
 * POST: create a new custom agent for the caller's org. Requires a
 *      session with role >= admin.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, agents as agentsTable } from "@sparkflow/db";
import {
  AuthError,
  logAudit,
  requireRole,
  requireSession,
} from "@sparkflow/auth";
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

export const runtime = "nodejs";

// Eagerly register core tools so the registry is populated for
// validation + toLlmTools() on the run route. Idempotent.
registerCoreTools(registry);

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

const createAgentSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().min(1),
  tools: z.array(z.string()).default([]),
  memoryScope: z.enum(["session", "user", "workspace", "global"]).default("session"),
  model: z.string().optional(),
});

type AgentCardDto = {
  id: string;
  name: string;
  role: string;
  description: string | null;
  systemPrompt: string;
  tools: string[];
  memoryScope: "session" | "user" | "workspace" | "global";
  model: string | null;
  version: number;
  builtIn: boolean;
  organizationId: string | null;
};

function builtInToDto(d: AgentDefinition): AgentCardDto {
  return {
    id: `builtin:${d.id}`,
    name: d.name,
    role: d.role,
    description: d.objective,
    systemPrompt: d.systemPrompt,
    tools: d.tools,
    memoryScope: d.memoryScope,
    model: d.model ?? null,
    version: 1,
    builtIn: true,
    organizationId: null,
  };
}

export async function GET() {
  try {
    const session = await requireSession();
    const db = getDb();

    // Only list the latest version per (org, name) — the PATCH path
    // creates new version rows, so naive SELECT would duplicate. We
    // handle "latest" in memory since the dataset per org is small.
    const rows = await db
      .select()
      .from(agentsTable)
      .where(
        or(
          isNull(agentsTable.organizationId),
          eq(agentsTable.organizationId, session.organizationId),
        ),
      );

    const latestByKey = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const key = `${row.organizationId ?? "global"}::${row.name}`;
      const existing = latestByKey.get(key);
      if (!existing || row.version > existing.version) {
        latestByKey.set(key, row);
      }
    }

    const customDtos: AgentCardDto[] = Array.from(latestByKey.values()).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      description: r.description ?? null,
      systemPrompt: r.systemPrompt,
      tools: Array.isArray(r.tools) ? (r.tools as string[]) : [],
      memoryScope: r.memoryScope,
      model: r.model ?? null,
      version: r.version,
      builtIn: false,
      organizationId: r.organizationId,
    }));

    const allDtos: AgentCardDto[] = [
      ...BUILT_INS.map(builtInToDto),
      ...customDtos,
    ];

    return NextResponse.json({ agents: allDtos });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, "admin");

    const body = await request.json();
    const parsed = createAgentSchema.parse(body);

    // Validate every requested tool is actually registered.
    const invalid = parsed.tools.filter((t) => !registry.has(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "unknown_tools",
          message: `Unknown tool names: ${invalid.join(", ")}`,
          invalid,
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const [inserted] = await db
      .insert(agentsTable)
      .values({
        organizationId: session.organizationId,
        name: parsed.name,
        role: parsed.role,
        description: parsed.description ?? null,
        systemPrompt: parsed.systemPrompt,
        tools: parsed.tools,
        memoryScope: parsed.memoryScope,
        model: parsed.model ?? null,
        version: 1,
      })
      .returning();

    if (!inserted) {
      return NextResponse.json(
        { error: "insert_failed" },
        { status: 500 },
      );
    }

    await logAudit(
      {
        action: "agent.create",
        targetType: "agent",
        targetId: inserted.id,
        metadata: { name: inserted.name, tools: parsed.tools },
      },
      session,
    );

    return NextResponse.json({ agent: inserted }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_body", issues: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected server error" },
      { status: 500 },
    );
  }
}
