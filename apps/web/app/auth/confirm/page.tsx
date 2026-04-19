"use client";

/**
 * /auth/confirm — client-side page that extracts the token from the URL hash
 * fragment (Supabase magic-link default). Supabase's `/auth/v1/verify` redirects
 * here with `#access_token=...&refresh_token=...&type=magiclink` in the fragment.
 * We establish the session in the browser, then POST to /auth/callback so the
 * server can upsert the user row + create a personal org.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@sparkflow/auth/client";

export const dynamic = "force-dynamic";

export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState("מאמת את הקישור...");

  useEffect(() => {
    const run = async () => {
      try {
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const errorDescription = params.get("error_description");

        if (errorDescription) {
          setStatus("error");
          setMessage(decodeURIComponent(errorDescription));
          return;
        }

        if (!accessToken || !refreshToken) {
          setStatus("error");
          setMessage("הקישור פג תוקף או שגוי. בקש קישור חדש.");
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setStatus("error");
          setMessage(error.message);
          return;
        }

        // Session cookies are set by the SSR client via setSession.
        // Now hit our server callback to upsert user + create org.
        await fetch("/auth/sync", { method: "POST", credentials: "include" });

        // Clean the URL and redirect.
        const next = new URLSearchParams(window.location.search).get("next") ?? "/";
        router.replace(next.startsWith("/") ? next : "/");
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "שגיאה לא ידועה");
      }
    };
    void run();
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        {status === "working" ? (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/70">{message}</p>
          </>
        ) : (
          <>
            <p className="mb-3 text-lg font-medium">שגיאה בהתחברות</p>
            <p className="text-sm text-red-300">{message}</p>
            <a
              href="/login"
              className="mt-6 inline-block rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950"
            >
              חזור להתחברות
            </a>
          </>
        )}
      </div>
    </main>
  );
}
