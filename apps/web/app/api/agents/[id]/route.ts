/**
 * /api/agents/[id] — single-agent GET / PATCH / DELETE.
 *
 * Built-in agents are addressed as `builtin:<id>` (see ../route.ts)
 * and are read-only. Custom agents use the raw row UUID.
 *
 * PATCH creates a new version row rather than mutating in place —
 * preserves an append-only history of agent definitions.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
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

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().min(1).optional(),
  tools: z.array(z.string()).optional(),
  memoryScope: z.enum(["session", "user", "workspace", "global"]).optional(),
  model: z.string().nullable().optional(),
});

function isBuiltInId(id: string): string | null {
  if (!id.startsWith("builtin:")) return null;
  return id.slice("builtin:".length);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await context.params;

    const builtinKey = isBuiltInId(id);
    if (builtinKey) {
      const def = BUILT_INS[builtinKey];
      if (!def) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({
        agent: {
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
          organizationId: null,
        },
      });
    }

    const db = getDb();
    const [row] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, id))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    // Org-scoped isolation: can only read your own org's agents (or global).
    if (row.organizationId && row.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      agent: {
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
        organizationId: row.organizationId,
      },
    });
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    requireRole(session, "admin");
    const { id } = await context.params;

    if (isBuiltInId(id)) {
      return NextResponse.json(
        { error: "built_in_readonly", message: "Built-in agents cannot be edited." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const patch = patchSchema.parse(body);

    if (patch.tools) {
      const invalid = patch.tools.filter((t) => !registry.has(t));
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: "unknown_tools", invalid },
          { status: 400 },
        );
      }
    }

    const db = getDb();
    const [current] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, id))
      .limit(1);
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (current.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Find the current max version for this (org, name) so the new row
    // gets version = max+1. name may itself be changing; use the new
    // name for the version lookup.
    const nextName = patch.name ?? current.name;
    const [latestSameName] = await db
      .select({ version: agentsTable.version })
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.organizationId, session.organizationId),
          eq(agentsTable.name, nextName),
        ),
      )
      .orderBy(desc(agentsTable.version))
      .limit(1);
    const nextVersion = (latestSameName?.version ?? 0) + 1;

    const [inserted] = await db
      .insert(agentsTable)
      .values({
        organizationId: session.organizationId,
        name: nextName,
        role: patch.role ?? current.role,
        description: patch.description !== undefined ? patch.description : current.description,
        systemPrompt: patch.systemPrompt ?? current.systemPrompt,
        tools: patch.tools ?? (Array.isArray(current.tools) ? current.tools : []),
        memoryScope: patch.memoryScope ?? current.memoryScope,
        model: patch.model !== undefined ? patch.model : current.model,
        version: nextVersion,
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
        action: "agent.update",
        targetType: "agent",
        targetId: inserted.id,
        metadata: { previousId: id, version: nextVersion },
      },
      session,
    );

    return NextResponse.json({ agent: inserted });
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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    requireRole(session, "admin");
    const { id } = await context.params;

    if (isBuiltInId(id)) {
      return NextResponse.json(
        { error: "built_in_readonly", message: "Built-in agents cannot be deleted." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [current] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.id, id))
      .limit(1);
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!current.organizationId || current.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Soft delete: the `agents` table has no deleted_at column; we
    // delete every version row under this (org, name) instead. If a
    // soft-delete column is added later, flip this to an UPDATE.
    await db
      .delete(agentsTable)
      .where(
        and(
          eq(agentsTable.organizationId, session.organizationId),
          eq(agentsTable.name, current.name),
        ),
      );

    await logAudit(
      {
        action: "agent.delete",
        targetType: "agent",
        targetId: id,
        metadata: { name: current.name },
      },
      session,
    );

    return NextResponse.json({ ok: true });
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
