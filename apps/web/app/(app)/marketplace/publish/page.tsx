export const dynamic = "force-dynamic";

/**
 * /marketplace/publish — form to publish a new listing from the caller's
 * org. Server component wraps the client form so we can redirect to
 * /login if there's no session.
 */
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import { PublishForm } from "./publish-form";

export default async function PublishPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Publish to marketplace</h1>
        <p className="text-sm text-neutral-500">
          Share an agent, tool, or workflow with other teams on SparkFlow.
          The payload is scanned for secret-looking strings before
          publishing — double-check you haven&apos;t embedded API keys.
        </p>
      </header>
      <PublishForm />
    </main>
  );
}
