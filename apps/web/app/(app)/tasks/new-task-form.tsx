"use client";

/**
 * Client form mounted on the tasks page. POSTs to /api/tasks and
 * refreshes the list on success via `router.refresh()` so the new task
 * appears without a full reload.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NewTaskForm() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ goal: trimmed }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        setGoal("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="task-goal" className="block text-sm font-medium">
        New task goal
      </label>
      <textarea
        id="task-goal"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        rows={3}
        placeholder="e.g. Draft a launch plan for the Q3 feature."
        className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring"
        disabled={isPending}
      />
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || goal.trim().length === 0}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? "Enqueuing…" : "Enqueue task"}
        </button>
      </div>
    </form>
  );
}
