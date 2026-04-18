import "@sparkflow/ui/styles/globals.css";
import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider, ToastProvider, ToastViewport } from "@sparkflow/ui";

export const metadata: Metadata = {
  title: "SparkFlow",
  description: "AI workspace — chat, search, research, agents, and automation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // RTL default for now (primary audience is Hebrew-speaking).
  // WP-D1 will swap this to a per-user/locale choice via next-intl.
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className="dark">
      <body>
        <ThemeProvider defaultTheme="dark">
          <ToastProvider swipeDirection="right">
            {children}
            <ToastViewport />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
