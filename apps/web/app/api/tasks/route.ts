/**
 * /api/tasks — list and enqueue tasks for the caller's active org.
 *
 * GET  → paginated task list (scoped to the session's organizationId).
 * POST → enqueues a new task `{goal, context?}` and returns the record.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import { enqueueTask, listTasks } from "@sparkflow/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  goal: z.string().min(1).max(4000),
  context: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const tasks = await listTasks({
    organizationId: session.organizationId,
    status: status as Parameters<typeof listTasks>[0]["status"],
    limit: Number.isFinite(limit) ? limit : 50,
  });

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const record = await enqueueTask({
    organizationId: session.organizationId,
    userId: session.user.id,
    goal: parsed.data.goal,
    context: parsed.data.context,
  });

  return NextResponse.json({ task: record });
}
