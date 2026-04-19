"use client";

/**
 * IP allowlist editor. One CIDR per line in a textarea, POSTs the
 * whole list to /api/enterprise/ip-allowlist. Errors (including the
 * `invalid_cidr` response) are surfaced inline.
 */
import { useState, useTransition } from "react";

interface Props {
  initial: string[];
}

export function IpAllowlistEditor({ initial }: Props) {
  const [text, setText] = useState(initial.join("\n"));
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; count: number }
    | { kind: "error"; message: string; invalid?: string[] }
  >({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function save() {
    const cidrs = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    startTransition(async () => {
      setStatus({ kind: "idle" });
      const res = await fetch("/api/enterprise/ip-allowlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cidrs }),
      });
      if (res.ok) {
        const data = (await res.json()) as { cidrs: string[] };
        setStatus({ kind: "ok", count: data.cidrs.length });
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          invalid?: string[];
        };
        setStatus({
          kind: "error",
          message: data.error ?? `HTTP ${res.status}`,
          invalid: data.invalid,
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        className="h-40 w-full rounded border bg-background p-2 font-mono text-xs"
        placeholder={"10.0.0.0/8\n192.168.1.0/24\n2001:db8::/32"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save allowlist"}
        </button>
        {status.kind === "ok" && (
          <span className="text-xs text-muted-foreground">
            Saved ({status.count} entr{status.count === 1 ? "y" : "ies"}).
          </span>
        )}
        {status.kind === "error" && (
          <span className="text-xs text-destructive">
            {status.message}
            {status.invalid && status.invalid.length > 0
              ? `: ${status.invalid.join(", ")}`
              : ""}
          </span>
        )}
      </div>
    </div>
  );
}
