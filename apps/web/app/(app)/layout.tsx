/**
 * Layout for authenticated routes.
 *
 * Server Component. Calls `requireSession()` — any unauthenticated
 * request is caught here (middleware already redirects most cases;
 * this is a defense-in-depth for paths that slip through the matcher).
 * We then hydrate the session into a client context so nested client
 * components can read it without another round-trip.
 *
 * The shell matches the Genspark AI Workspace 4.0 layout: a narrow
 * icon rail on the visual start edge, a slim top bar, and the routed
 * content filling the remaining area.
 */
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, organizations } from "@sparkflow/db";
import { getSession } from "@sparkflow/auth";
import { SessionProvider } from "./session-context";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const db = getDb();
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

  const orgName = org?.name ?? "Workspace";

  return (
    <SessionProvider session={session}>
      <div className="flex min-h-dvh">
        <AppSidebar />
        <div className="flex min-h-dvh flex-1 flex-col">
          <TopBar organizationName={orgName} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
