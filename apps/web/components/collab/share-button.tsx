"use client";

/**
 * ShareButton — opens a dialog that mints a share link for a given
 * resource and exposes a copy-to-clipboard button.
 *
 * Flow:
 *   1. User clicks "Share".
 *   2. Dialog opens with visibility selector (public / unlisted) and an
 *      optional expiry. Until they hit "Generate" we don't hit the
 *      server — this keeps links from being minted accidentally on
 *      dialog open.
 *   3. "Generate" POSTs /api/collab/share and renders the resulting URL
 *      alongside a copy button.
 *   4. "Regenerate" hits the endpoint again and replaces the URL. The
 *      old slug keeps working until it expires or is explicitly revoked.
 *
 * The component is intentionally dependency-light: no form library, no
 * toast, just the primitives we already ship in `@sparkflow/ui`.
 */
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Input,
  Label,
} from "@sparkflow/ui";
import { Link2, Copy, Check, Loader2 } from "lucide-react";

export type ShareResourceType = "conversation" | "workflow" | "artifact";
export type ShareVisibility = "public" | "unlisted";

export interface ShareButtonProps {
  resourceType: ShareResourceType;
  resourceId: string;
  /** Label shown on the trigger button. Defaults to "Share". */
  label?: string;
  /** Override the trigger. When supplied, `label` is ignored. */
  trigger?: React.ReactNode;
}

interface GenerateResponse {
  slug: string;
  url: string;
}

export function ShareButton({
  resourceType,
  resourceId,
  label = "Share",
  trigger,
}: ShareButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [visibility, setVisibility] = React.useState<ShareVisibility>("unlisted");
  const [generating, setGenerating] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Reset state when dialog closes so the next open starts clean.
  React.useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setError(null);
      setCopied(false);
    }
  }, [open]);

  const generate = React.useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/collab/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceType, resourceId, visibility }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as GenerateResponse;
      setShareUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate link");
    } finally {
      setGenerating(false);
    }
  }, [resourceType, resourceId, visibility]);

  const copy = React.useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard access denied");
    }
  }, [shareUrl]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Link2 className="me-2 h-4 w-4" />
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this {resourceType}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view. You can revoke access at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div>
            <Label className="mb-1.5 block">Visibility</Label>
            <div className="flex gap-2">
              <VisibilityChip
                active={visibility === "unlisted"}
                onClick={() => setVisibility("unlisted")}
                label="Unlisted"
                hint="Only people with the link"
              />
              <VisibilityChip
                active={visibility === "public"}
                onClick={() => setVisibility("public")}
                label="Public"
                hint="Discoverable"
              />
            </div>
          </div>

          {shareUrl ? (
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="sm" onClick={copy}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-[hsl(var(--destructive))]">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={generating}
          >
            Close
          </Button>
          <Button onClick={generate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : shareUrl ? (
              "Regenerate"
            ) : (
              "Generate link"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VisibilityChipProps {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}

function VisibilityChip({ active, label, hint, onClick }: VisibilityChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-md border px-3 py-2 text-start text-sm transition-colors " +
        (active
          ? "border-[hsl(var(--ring))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
          : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]")
      }
    >
      <div className="font-medium">{label}</div>
      <div className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</div>
    </button>
  );
}
