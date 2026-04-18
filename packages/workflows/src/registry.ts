/**
 * CRUD helpers for workflow definitions.
 *
 * Update semantics: `updateWorkflow` never mutates an existing row in
 * place — it bumps `version` and writes a new row with the patched
 * fields, so historical runs continue to reference the exact graph
 * they executed against.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, workflows } from "@sparkflow/db";
import type {
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowTrigger,
} from "./types";

type WorkflowRow = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  definition: unknown;
  trigger: unknown;
  version: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function rowToDefinition(row: WorkflowRow): WorkflowDefinition {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    graph: row.definition as WorkflowGraph,
    trigger: row.trigger as WorkflowTrigger,
    version: row.version,
  };
}

export async function listWorkflows(filter: {
  organizationId: string;
  limit?: number;
}): Promise<WorkflowDefinition[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.organizationId, filter.organizationId))
    .orderBy(desc(workflows.updatedAt))
    .limit(Math.max(1, Math.min(filter.limit ?? 100, 500)));
  return rows.map(rowToDefinition);
}

export async function getWorkflow(
  id: string,
): Promise<WorkflowDefinition | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);
  return row ? rowToDefinition(row) : null;
}

export type CreateWorkflowInput = {
  organizationId: string;
  name: string;
  description?: string;
  graph: WorkflowGraph;
  trigger: WorkflowTrigger;
};

export async function createWorkflow(
  input: CreateWorkflowInput,
): Promise<WorkflowDefinition> {
  const db = getDb();
  const [row] = await db
    .insert(workflows)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      definition: input.graph as object,
      trigger: input.trigger as object,
      version: 1,
      active: false,
    })
    .returning();
  if (!row) throw new Error("createWorkflow: insert returned no row");
  return rowToDefinition(row);
}

export type UpdateWorkflowPatch = {
  name?: string;
  description?: string;
  graph?: WorkflowGraph;
  trigger?: WorkflowTrigger;
};

/**
 * "Update" by inserting a new row with an incremented version number.
 * The id of the new row is returned; callers that need to keep the
 * previous id around (e.g. cron scheduler) should update their own
 * pointer to the returned `id`.
 */
export async function updateWorkflow(
  id: string,
  patch: UpdateWorkflowPatch,
): Promise<WorkflowDefinition> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id))
    .limit(1);
  if (!existing) throw new Error(`workflow ${id} not found`);

  const [row] = await db
    .insert(workflows)
    .values({
      organizationId: existing.organizationId,
      name: patch.name ?? existing.name,
      description:
        patch.description !== undefined ? patch.description : existing.description,
      definition: (patch.graph ?? existing.definition) as object,
      trigger: (patch.trigger ?? existing.trigger) as object,
      version: existing.version + 1,
      active: existing.active,
    })
    .returning();
  if (!row) throw new Error("updateWorkflow: insert returned no row");
  return rowToDefinition(row);
}

export async function activateWorkflow(
  id: string,
): Promise<WorkflowDefinition> {
  const db = getDb();
  const [row] = await db
    .update(workflows)
    .set({ active: true, updatedAt: new Date() })
    .where(eq(workflows.id, id))
    .returning();
  if (!row) throw new Error(`workflow ${id} not found`);
  return rowToDefinition(row);
}

export async function deactivateWorkflow(
  id: string,
): Promise<WorkflowDefinition> {
  const db = getDb();
  const [row] = await db
    .update(workflows)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(workflows.id, id)))
    .returning();
  if (!row) throw new Error(`workflow ${id} not found`);
  return rowToDefinition(row);
}
