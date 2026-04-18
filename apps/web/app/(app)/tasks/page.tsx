export const dynamic = "force-dynamic";

/**
 * /tasks — server component list page for the autonomous task engine.
 *
 * Loads the current org's tasks server-side, renders status badges and
 * mounts a small client-side form for enqueueing new tasks.
 */
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import { listTasks, type TaskRecord, type TaskState } from "@sparkflow/tasks";
import { NewTaskForm } from "./new-task-form";

const STATUS_STYLES: Record<TaskState, string> = {
  queued: "bg-slate-200 text-slate-800",
  planning: "bg-blue-100 text-blue-800",
  running: "bg-indigo-100 text-indigo-800",
  waiting: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-800",
  cancelled: "bg-neutral-200 text-neutral-700",
};

function StatusBadge({ status }: { status: TaskState }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

function TaskRow({ task }: { task: TaskRecord }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{task.title}</span>
          <StatusBadge status={task.status} />
        </div>
        <div className="mt-0.5 truncate text-xs text-neutral-500">
          {task.input.goal}
        </div>
      </div>
      <div className="shrink-0 text-xs text-neutral-500">
        {task.createdAt.toLocaleString()}
      </div>
    </li>
  );
}

export default async function TasksPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const tasks = await listTasks({ organizationId: session.organizationId });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-neutral-500">
            Autonomous goal-oriented runs.
          </p>
        </div>
      </header>

      <section className="mb-8">
        <NewTaskForm />
      </section>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">
          No tasks yet. Kick one off above.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t: TaskRecord) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
