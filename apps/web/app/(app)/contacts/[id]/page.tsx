export const dynamic = "force-dynamic";

/**
 * /contacts/[id] — detail page with activity timeline and an inline
 * edit form. Server-renders the contact + activity rows, then mounts a
 * client component that wires PATCH / DELETE / enrich.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import {
  getContact,
  listActivity,
  type Contact,
  type ContactActivity,
} from "@sparkflow/crm";
import { ContactDetail } from "./contact-detail";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const contact = await getContact(session.organizationId, id);
  if (!contact) notFound();
  const activity = await listActivity(session.organizationId, id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-4">
        <Link
          href="/contacts"
          className="text-sm text-indigo-700 hover:underline"
        >
          ← Back to contacts
        </Link>
      </header>
      <ContactDetail
        contact={contact as Contact}
        activity={activity as ContactActivity[]}
      />
    </div>
  );
}
