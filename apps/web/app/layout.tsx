import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SparkFlow",
  description: "AI workspace — chat, search, research, agents, and automation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // RTL default for now (primary audience is Hebrew-speaking).
  // WP-D1 will swap this to a per-user/locale choice via next-intl.
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
