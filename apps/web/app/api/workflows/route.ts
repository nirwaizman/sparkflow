/**
 * /api/workflows — list and create workflows for the caller's org.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import { createWorkflow, listWorkflows } from "@sparkflow/workflows";
import { emitEvent } from "@/lib/public-api/emit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nodeKinds = [
  "trigger",
  "llm",
  "tool",
  "agent",
  "condition",
  "loop",
  "output",
] as const;

const graphSchema = z.object({
  entryNodeId: z.string().min(1),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(nodeKinds),
        config: z.record(z.unknown()),
        next: z.array(z.string()).optional(),
        condition: z.string().optional(),
      }),
    )
    .min(1),
});

const triggerSchema = z.object({
  kind: z.enum(["manual", "webhook", "cron"]),
  config: z.unknown().optional(),
});

const postSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  graph: graphSchema,
  trigger: triggerSchema,
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const workflows = await listWorkflows({
    organizationId: session.organizationId,
  });
  return NextResponse.json({ workflows });
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

  const created = await createWorkflow({
    organizationId: session.organizationId,
    name: parsed.data.name,
    description: parsed.data.description,
    graph: parsed.data.graph,
    trigger: parsed.data.trigger,
  });

  emitEvent({
    organizationId: session.organizationId,
    event: "workflow.created",
    data: { workflow: created },
  });

  return NextResponse.json({ workflow: created });
}
