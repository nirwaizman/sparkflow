/**
 * POST /api/super/plan
 *
 * Body: { goal: string }
 * Returns: { subTasks: SubTask[] }
 *
 * Decomposes a freeform goal into a typed sub-task plan without
 * executing anything. The UI shows the plan to the user, lets them
 * uncheck sub-tasks, and then POSTs the (filtered) subset to
 * `/api/super/run` to actually execute.
 *
 * A dummy `runSubTask` is passed because planning never invokes it —
 * keeps the constructor contract tight.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SuperAgent } from "@sparkflow/agents";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  goal: z.string().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      try {
        await requireSession();
      } catch {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const json = await request.json();
    const parsed = bodySchema.parse(json);

    const agent = new SuperAgent({
      runSubTask: async () => {
        throw new Error("plan route never executes sub-tasks");
      },
    });

    const subTasks = await agent.plan(parsed.goal);
    return NextResponse.json({ subTasks });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: err.issues },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
