/**
 * POST /api/marketplace/listings/[id]/install — install a listing into
 * the caller's org.
 *
 * The install adapter:
 *   - agent    → inserts a row into the org's `agents` table with the
 *                published definition's fields.
 *   - workflow → calls `createWorkflow` with the published graph.
 *   - tool     → records the install only; the per-org tool registry is
 *                derived from `listInstallsForOrg(kind === "tool")` so
 *                no separate table is needed for this scaffold.
 *
 * Idempotent: a second call for the same (listingId, org) returns the
 * existing install.
 *
 * TODO(tool-registry): when the per-org tool registry lands, extend the
 * tool branch below to write into `organization_tools` (or similar) so
 * the registry can be enforced server-side by agent runs.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, agents as agentsTable } from "@sparkflow/db";
import { getSession } from "@sparkflow/auth";
import {
  ListingNotInstallableError,
  installListing,
  type InstallCloner,
} from "@sparkflow/marketplace";
import { createWorkflow } from "@sparkflow/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cloneAgent(organizationId: string): InstallCloner {
  return async ({ listing }) => {
    const entity = listing.entity as {
      name?: string;
      role?: string;
      description?: string | null;
      systemPrompt?: string;
      tools?: string[];
      memoryScope?: "session" | "user" | "workspace" | "global";
      model?: string | null;
    };
    const db = getDb();
    const [inserted] = await db
      .insert(agentsTable)
      .values({
        organizationId,
        name: entity.name ?? listing.title,
        role: entity.role ?? "assistant",
        description: entity.description ?? listing.description,
        systemPrompt: entity.systemPrompt ?? "",
        tools: Array.isArray(entity.tools) ? entity.tools : [],
        memoryScope: entity.memoryScope ?? "session",
        model: entity.model ?? null,
        version: 1,
      })
      .returning();
    return { installedEntityId: inserted?.id ?? null };
  };
}

function cloneWorkflow(organizationId: string): InstallCloner {
  return async ({ listing }) => {
    const entity = listing.entity as {
      name?: string;
      description?: string;
      graph?: { entryNodeId: string; nodes: unknown[] };
      trigger?: { kind: "manual" | "webhook" | "cron"; config?: unknown };
    };
    if (!entity.graph || !entity.trigger) {
      throw new Error("workflow_listing_missing_graph_or_trigger");
    }
    const created = await createWorkflow({
      organizationId,
      name: entity.name ?? listing.title,
      description: entity.description ?? listing.description,
      graph: entity.graph as never,
      trigger: entity.trigger as never,
    });
    return { installedEntityId: created.id };
  };
}

/** Tool installs record a pointer only. */
function cloneTool(): InstallCloner {
  return async ({ listing }) => {
    const entity = listing.entity as { name?: string };
    // `name` is the registry key; we store it as the "installed entity id".
    return { installedEntityId: entity.name ?? null };
  };
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;

  try {
    // We don't know the kind until we've resolved the listing; install
    // logic resolves it for us and passes it to the cloner. We use a
    // single dispatching cloner here so the library stays generic.
    const cloner: InstallCloner = async (args) => {
      switch (args.listing.kind) {
        case "agent":
          return cloneAgent(args.organizationId)(args);
        case "workflow":
          return cloneWorkflow(args.organizationId)(args);
        case "tool":
          return cloneTool()(args);
      }
    };

    const result = await installListing(id, session.organizationId, {
      installedByUserId: session.user.id,
      cloner,
    });
    return NextResponse.json({ install: result.install, kind: result.kind });
  } catch (err) {
    if (err instanceof ListingNotInstallableError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "install_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 400 },
    );
  }
}
