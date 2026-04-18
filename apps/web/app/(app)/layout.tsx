/**
 * Layout for authenticated routes.
 *
 * Server Component. Calls `requireSession()` — any unauthenticated
 * request is caught here (middleware already redirects most cases;
 * this is a defense-in-depth for paths that slip through the matcher).
 * We then hydrate the session into a client context so nested client
 * components can read it without another round-trip.
 *
 * Pages under this group MUST be placed in `app/(app)/...`. The
 * existing `/` route intentionally stays outside the group for now so
 * the public landing/chat page keeps working unchanged.
 */
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, organizations } from "@sparkflow/db";
import { getSession } from "@sparkflow/auth";
import { SessionProvider } from "./session-context";
import { TopBar } from "./top-bar";

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
      <div className="flex min-h-dvh flex-col">
        <TopBar organizationName={orgName} />
        <div className="flex-1">{children}</div>
      </div>
    </SessionProvider>
  );
}
