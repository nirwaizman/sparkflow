"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@sparkflow/ui";

export function CopyButton({
  value,
  className,
  label = "Copy",
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked in sandboxed iframes; silently no-op.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onCopy}
      className={className}
      aria-label={label}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}
