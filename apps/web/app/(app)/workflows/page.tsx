export const dynamic = "force-dynamic";

/**
 * /workflows — server component listing the org's workflows.
 *
 * The "New workflow" affordance opens a client-side JSON editor
 * (textarea with validation) because the full visual editor is out of
 * scope for the WP-C5 scaffold — see TODO below.
 */
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import {
  listWorkflows,
  type WorkflowDefinition,
} from "@sparkflow/workflows";
import { WorkflowEditor } from "./workflow-editor";

function WorkflowRow({ wf }: { wf: WorkflowDefinition }) {
  return (
    <li className="rounded-lg border px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{wf.name}</span>
        <span className="text-xs text-neutral-500">
          v{wf.version} · trigger: {wf.trigger.kind}
        </span>
      </div>
      {wf.description ? (
        <p className="mt-1 text-xs text-neutral-500">{wf.description}</p>
      ) : null}
      <p className="mt-1 text-xs text-neutral-400">
        {wf.graph.nodes.length} node{wf.graph.nodes.length === 1 ? "" : "s"}
      </p>
    </li>
  );
}

export default async function WorkflowsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const workflows = await listWorkflows({
    organizationId: session.organizationId,
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-sm text-neutral-500">
            Reusable multi-step pipelines.
          </p>
        </div>
      </header>

      {/* TODO(WP-C5.1): replace this placeholder JSON editor with a
          proper visual node graph editor. The scaffold keeps the JSON
          shape as the source of truth so the runtime doesn't change. */}
      <section className="mb-8">
        <WorkflowEditor />
      </section>

      {workflows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">
          No workflows yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {workflows.map((w: WorkflowDefinition) => (
            <WorkflowRow key={w.id} wf={w} />
          ))}
        </ul>
      )}
    </div>
  );
}
