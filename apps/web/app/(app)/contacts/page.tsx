export const dynamic = "force-dynamic";

/**
 * /contacts — server-rendered list with search + tag filter.
 *
 * Search and filtering are driven by URL params so the view is
 * bookmarkable and pushState-driven navigation stays cheap. Bulk actions
 * (tag, export, enrich, delete) are delegated to the client component
 * below — it mutates via the /api/contacts endpoints and then calls
 * `router.refresh()`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import { listContacts, type Contact } from "@sparkflow/crm";
import { ContactsToolbar } from "./contacts-toolbar";
import { BulkContactsActions } from "./bulk-actions";

type Search = { q?: string; tag?: string };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const contacts = await listContacts({
    organizationId: session.organizationId,
    q: params.q,
    tag: params.tag,
  });

  const allTags = new Set<string>();
  for (const c of contacts) for (const t of c.tags) allTags.add(t);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-neutral-500">
            People in your CRM, searchable by name, email or company.
          </p>
        </div>
        <Link
          href="/contacts/new"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          New contact
        </Link>
      </header>

      <ContactsToolbar
        initialQ={params.q ?? ""}
        initialTag={params.tag ?? ""}
        knownTags={[...allTags].sort()}
      />

      {contacts.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed p-8 text-center text-sm text-neutral-500">
          No contacts match. Add one or import a CSV to get started.
        </p>
      ) : (
        <BulkContactsActions contacts={contacts as Contact[]} />
      )}
    </div>
  );
}
