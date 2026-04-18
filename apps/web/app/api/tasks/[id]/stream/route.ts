/**
 * /api/tasks/[id]/stream — SSE stream of TaskEvents while the task
 * executes in-process. WP-C4 scaffold: the runner lives in the request
 * lifetime; WP-C4.5 will move this to a background queue and have this
 * route subscribe to a broker (Redis/Inngest) instead.
 */
import { type NextRequest } from "next/server";
import { getSession } from "@sparkflow/auth";
import { TaskExecutor, getTask, type TaskEvent } from "@sparkflow/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encodeEvent(ev: TaskEvent): Uint8Array {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  return new TextEncoder().encode(line);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const { id } = await context.params;

  const task = await getTask(id);
  if (!task || task.organizationId !== session.organizationId) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const executor = new TaskExecutor();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of executor.run(task)) {
          controller.enqueue(encodeEvent(ev));
          if (ev.type === "finish" || ev.type === "error") break;
        }
      } catch (err) {
        controller.enqueue(
          encodeEvent({
            type: "error",
            payload: {
              message: err instanceof Error ? err.message : String(err),
            },
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
