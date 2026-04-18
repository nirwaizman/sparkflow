/**
 * /api/tasks/[id] — inspect and cancel a single task.
 *
 * GET    → `{task, steps}` — the task record plus its ordered step rows.
 * DELETE → cancels the task (transitions status to `cancelled`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, taskSteps } from "@sparkflow/db";
import { getSession } from "@sparkflow/auth";
import { cancelTask, getTask } from "@sparkflow/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const task = await getTask(id);
  if (!task || task.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const db = getDb();
  const steps = await db
    .select()
    .from(taskSteps)
    .where(eq(taskSteps.taskId, id))
    .orderBy(asc(taskSteps.stepIndex));

  return NextResponse.json({ task, steps });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  const task = await getTask(id);
  if (!task || task.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const cancelled = await cancelTask(id, session.user.id);
  return NextResponse.json({ task: cancelled });
}
