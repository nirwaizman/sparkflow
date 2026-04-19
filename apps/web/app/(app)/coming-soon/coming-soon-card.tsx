"use client";

/**
 * Client island for the /coming-soon page.
 *
 * Captures a "notify me" email interest signal and persists it to
 * `localStorage` under `sparkflow-waitlist` as a JSON object keyed by
 * feature. A real waitlist table + email integration is out of scope
 * for this change — the localStorage handoff lets us surface intent
 * without shipping a half-wired server route.
 */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@sparkflow/ui";

const STORAGE_KEY = "sparkflow-waitlist";

type WaitlistMap = Record<string, { email: string; ts: number }>;

function readWaitlist(): WaitlistMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as WaitlistMap;
    return {};
  } catch {
    return {};
  }
}

function writeWaitlist(map: WaitlistMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function ComingSoonCard({
  featureKey,
  featureLabel,
}: {
  featureKey: string;
  featureLabel: string;
}) {
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const map = readWaitlist();
    const existing = map[featureKey];
    if (existing) {
      setEmail(existing.email);
      setSaved(true);
    }
  }, [featureKey]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("נא להזין כתובת אימייל תקינה");
      return;
    }
    const map = readWaitlist();
    map[featureKey] = { email: trimmed, ts: Date.now() };
    writeWaitlist(map);
    setSaved(true);
    setError(null);
  }

  return (
    <Card className="border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 shadow-sm">
      <CardHeader>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
          <Sparkles className="h-5 w-5" />
        </div>
        <CardTitle className="text-xl">{featureLabel} — בפיתוח</CardTitle>
        <CardDescription>
          אנחנו עובדים על היכולת הזאת. השאר כתובת מייל ונעדכן אותך ברגע שהיא
          זמינה.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={submit}
          noValidate
        >
          <div className="flex-1">
            <Label htmlFor="notify-email" className="text-xs">
              אימייל
            </Label>
            <Input
              id="notify-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSaved(false);
              }}
              placeholder="name@company.com"
              required
            />
            {error ? (
              <p className="mt-1 text-xs text-[hsl(var(--danger))]">{error}</p>
            ) : null}
          </div>
          <Button type="submit">{saved ? "נשמר" : "הודיעו לי"}</Button>
        </form>
        {saved && !error ? (
          <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
            תודה! נעדכן אותך ברגע ש-{featureLabel} יהיה זמין בחשבון שלך.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
