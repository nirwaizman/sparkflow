export const dynamic = "force-dynamic";

/**
 * /workflows/[id] — single-workflow detail page.
 *
 * Loads the workflow from the DB (org-scoped) and hands the full
 * `WorkflowDefinition` to <VisualEditor /> so the canvas preloads
 * with the saved graph. Save still posts to /api/workflows
 * (new-version semantics) to keep the API contract unchanged; Run
 * targets /api/workflows/[id]/run.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import {
  getWorkflowForOrg,
  type WorkflowDefinition,
} from "@sparkflow/workflows";
import { VisualEditor } from "@/components/workflows/visual-editor";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const def: WorkflowDefinition | null = await getWorkflowForOrg(
    id,
    session.organizationId,
  );
  if (!def) notFound();

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-xs text-neutral-500">
            <Link href="/workflows" className="hover:underline">
              Workflows
            </Link>{" "}
            / <span className="text-neutral-800">{def.name}</span>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{def.name}</h1>
          <p className="text-sm text-neutral-500">
            v{def.version} · trigger: {def.trigger.kind} ·{" "}
            {def.graph.nodes.length} node
            {def.graph.nodes.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>
      <VisualEditor initial={def} workflowId={def.id} />
    </div>
  );
}
