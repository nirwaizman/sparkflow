/**
 * /api/workflows/[id]/run — execute a workflow synchronously and
 * return `{runId, status}` once the run finishes. For streaming
 * progress (mirroring the task stream endpoint) the client should use
 * the SSE variant added in WP-C5.1.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import {
  getWorkflowForOrg,
  runWorkflow,
  type TaskEvent,
} from "@sparkflow/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  input: z.unknown().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  // Cross-tenant guard: workflow rows are org-scoped, so the lookup
  // must filter by the caller's organizationId. Without this, any
  // authenticated user could run another org's workflow (and spend
  // their LLM/tool budget) by guessing a UUID. Return 404 rather than
  // 403 to avoid confirming existence.
  const def = await getWorkflowForOrg(id, session.organizationId);
  if (!def) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is acceptable — treat as no input.
  }
  const parsed = postSchema.safeParse(body);
  const input = parsed.success ? parsed.data.input : undefined;

  const events: TaskEvent[] = [];
  let status: "completed" | "failed" = "completed";
  for await (const ev of runWorkflow(def, input, {
    organizationId: session.organizationId,
    userId: session.user.id,
  })) {
    events.push(ev);
    if (ev.type === "error") status = "failed";
  }

  return NextResponse.json({
    // NOTE: the concrete run id is recorded inside the workflowRuns
    // table by runWorkflow(). Exposing it here requires a small surface
    // addition to @sparkflow/workflows — tracked in WP-C5.1.
    runId: null,
    status,
    events,
  });
}
