import "@sparkflow/ui/styles/globals.css";
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeProvider } from "@sparkflow/ui";

export const metadata: Metadata = {
  title: "SparkFlow Admin",
  description: "Internal operator console.",
};

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/users", label: "Users" },
  { href: "/orgs", label: "Orgs" },
  { href: "/usage", label: "Usage" },
  { href: "/feature-flags", label: "Feature flags" },
  { href: "/announcements", label: "Broadcast" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className="dark">
      <body>
        <ThemeProvider defaultTheme="dark">
          <div className="flex min-h-dvh">
            <aside className="w-56 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <div className="mb-6 text-sm font-semibold">SparkFlow Admin</div>
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-2 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </aside>
            <main className="flex-1 p-6">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
