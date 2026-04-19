/**
 * /privacy — data-export, account deletion, and consent preferences.
 *
 * Server component. Uses `requireSession` (via the parent (app) layout's
 * check) to guarantee authentication. Client interactivity is delegated
 * to `./actions` for localStorage + fetch.
 */
import { redirect } from "next/navigation";
import { getSession } from "@sparkflow/auth";
import {
  ConsentPrefs,
  DeleteAccountButton,
  ExportDataButton,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Manage your data export, deletion, and consent preferences.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Data export</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Download a ZIP archive containing your conversations, messages,
          files, memories, and audit log entries for this workspace.
        </p>
        <ExportDataButton />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Delete account</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Schedule your data in this workspace for deletion. There is a
          30-day grace window during which you can contact support to cancel.
        </p>
        <DeleteAccountButton />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Consent preferences</h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">
          Preferences are stored on this device. TODO: persist to the
          server so they follow you across devices.
        </p>
        <ConsentPrefs />
      </section>
    </div>
  );
}
