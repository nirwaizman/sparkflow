/**
 * GET /share/[slug] — public, read-only view of a shared resource.
 *
 * Resolves the slug against `shared_links`, then renders a
 * minimal, read-only view of the underlying conversation / workflow /
 * artifact. Live collaboration is intentionally disabled here: cursors
 * + awareness would leak presence of authenticated viewers to anonymous
 * visitors, which is not something we want from a share-link.
 *
 * Error branches:
 *   - unknown or expired slug → `notFound()` (404).
 *   - unsupported resource type → rendered as a generic "Unavailable" card.
 *
 * SEO / crawlers:
 *   We set `noindex` for "unlisted" visibility and leave crawlers alone
 *   for "public". A proper `robots` entry belongs in the root metadata
 *   once we've decided on the overall SEO strategy for share pages.
 *
 * NOTE(auth): this page lives under the `(app)` route group which
 * currently redirects unauthenticated visitors via `(app)/layout.tsx`.
 * To make share links genuinely public, `(app)/layout.tsx` needs to
 * allow the `/share/*` sub-tree, OR this page should be moved out of
 * the `(app)` group (e.g. to `app/share/[slug]/page.tsx`). Tracked as a
 * TODO below.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import {
  getDb,
  conversations,
  messages,
  workflows,
  type SharedLink,
} from "@sparkflow/db";
import { resolveShareLink } from "@sparkflow/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveShareLink(slug);
  const robots = resolved?.link.visibility === "unlisted"
    ? { index: false, follow: false }
    : undefined;
  return {
    title: "Shared on SparkFlow",
    robots,
  };
}

export default async function SharePage({ params }: PageProps) {
  const { slug } = await params;
  const resolved = await resolveShareLink(slug);
  if (!resolved) notFound();

  const { link } = resolved;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Shared {link.resourceType}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {titleFor(link.resourceType)}
        </h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Read-only view • {link.visibility === "public" ? "Public" : "Unlisted"}
          {link.expiresAt
            ? ` • Expires ${new Date(link.expiresAt).toLocaleDateString()}`
            : ""}
        </p>
      </header>

      <SharedResourceBody link={link} />
    </div>
  );
}

function titleFor(type: SharedLink["resourceType"]): string {
  switch (type) {
    case "conversation":
      return "Conversation";
    case "workflow":
      return "Workflow";
    case "artifact":
      return "Artifact";
  }
}

async function SharedResourceBody({ link }: { link: SharedLink }) {
  switch (link.resourceType) {
    case "conversation":
      return <SharedConversation conversationId={link.resourceId} />;
    case "workflow":
      return <SharedWorkflow workflowId={link.resourceId} />;
    case "artifact":
      // TODO(artifacts): artifact table not yet modeled in @sparkflow/db.
      // When it lands, mirror the conversation/workflow pattern.
      return (
        <div className="rounded-md border border-[hsl(var(--border))] p-6 text-sm text-[hsl(var(--muted-foreground))]">
          Artifact preview is not yet available.
        </div>
      );
  }
}

async function SharedConversation({ conversationId }: { conversationId: string }) {
  const db = getDb();
  const [conversation] = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return (
      <div className="rounded-md border border-[hsl(var(--border))] p-6 text-sm">
        This conversation is no longer available.
      </div>
    );
  }

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId)))
    .orderBy(asc(messages.createdAt));

  return (
    <section className="flex flex-col gap-4">
      {conversation.title ? (
        <h2 className="text-lg font-medium">{conversation.title}</h2>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          No messages in this conversation.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
            >
              <div className="mb-1 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                {m.role}
              </div>
              <div className="whitespace-pre-wrap text-sm">{m.content}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function SharedWorkflow({ workflowId }: { workflowId: string }) {
  const db = getDb();
  const [wf] = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      description: workflows.description,
      version: workflows.version,
      definition: workflows.definition,
    })
    .from(workflows)
    .where(eq(workflows.id, workflowId))
    .limit(1);

  if (!wf) {
    return (
      <div className="rounded-md border border-[hsl(var(--border))] p-6 text-sm">
        This workflow is no longer available.
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">{wf.name}</h2>
        {wf.description ? (
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {wf.description}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Version {wf.version}
        </p>
      </div>
      <pre className="overflow-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-xs">
        {JSON.stringify(wf.definition, null, 2)}
      </pre>
    </section>
  );
}
