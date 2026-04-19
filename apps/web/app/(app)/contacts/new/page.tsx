export const dynamic = "force-dynamic";

/**
 * /contacts/new — server component that redirects unauth users and
 * mounts the client-side create form.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@sparkflow/auth";
import { NewContactForm } from "./new-contact-form";

export default async function NewContactPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-4">
        <Link
          href="/contacts"
          className="text-sm text-indigo-700 hover:underline"
        >
          ← Back to contacts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New contact</h1>
      </header>
      <NewContactForm />
    </div>
  );
}
