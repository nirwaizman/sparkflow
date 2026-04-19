"use client";

/**
 * ReferralBanner — dismissible bar shown on the workspace home.
 * Fetches the caller's referral code on mount via POST /api/referrals/code
 * so the code is created lazily on first render.
 *
 * Dismissal is local-only (localStorage). The banner re-appears if the
 * user clears site data; that is intentional.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@sparkflow/ui";

const LS_KEY = "sf.referral-banner.dismissed.v1";

type CodeResponse = { code: string };

async function fetchCode(): Promise<string | null> {
  try {
    const res = await fetch("/api/referrals/code", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as CodeResponse;
    return data.code ?? null;
  } catch {
    return null;
  }
}

function shareLink(code: string): string {
  if (typeof window === "undefined") return `?ref=${code}`;
  const origin = window.location.origin;
  return `${origin}/signup?ref=${encodeURIComponent(code)}`;
}

export function ReferralBanner(): React.ReactElement | null {
  const [dismissed, setDismissed] = useState<boolean>(true);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(LS_KEY) === "1");
  }, []);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    void fetchCode().then((c) => {
      if (!cancelled) setCode(c);
    });
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(LS_KEY, "1");
      } catch {
        // storage quota or private mode — ignore.
      }
    }
  }, []);

  const copy = useCallback(async () => {
    if (!code) return;
    const link = shareLink(code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard not available — fall through silently.
    }
  }, [code]);

  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Refer a friend"
      className="flex items-center gap-3 rounded-lg border border-white/10 bg-gradient-to-r from-indigo-500/15 via-fuchsia-500/10 to-amber-500/15 px-4 py-3 text-sm"
    >
      <span className="font-medium">Invite a friend, earn credits.</span>
      <span className="opacity-70">
        Each referral that signs up gives you credits you can spend on
        any agent or workflow.
      </span>
      <div className="ms-auto flex items-center gap-2">
        <code className="rounded bg-black/30 px-2 py-1 text-xs">
          {code ?? "Loading..."}
        </code>
        <Button
          type="button"
          size="sm"
          onClick={copy}
          disabled={!code}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={dismiss}
          aria-label="Dismiss referral banner"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export default ReferralBanner;
