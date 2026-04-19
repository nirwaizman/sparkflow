"use client";

/**
 * Client-side AI Designer studio.
 *
 * - Prompt form: prompt / kind / theme / variations.
 * - Generate: POST /api/design/generate → `designs` state (1–4 entries).
 * - Each card: sandboxed iframe preview, device tabs (desktop/tablet/mobile),
 *   and actions (Download, Copy HTML, Copy embed, Open in new tab, PNG, Refine).
 * - Refine: Sheet with a textarea → POST /api/design/refine, replaces the
 *   corresponding design in place.
 *
 * PNG export is stubbed: if `html2canvas` is not installed we fall back to
 * opening the design in a new tab so the user can use the browser's native
 * "Save as image" or screenshot tool. See the TODO near `exportPng`.
 */
import { useCallback, useState } from "react";
import {
  Button,

  Label,
  Textarea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@sparkflow/ui";
import { downloadBlob } from "@/lib/download";
import { PreviewIframe } from "@/components/design/preview-iframe";
import {
  DeviceTabs,
  DEVICE_WIDTHS,
  type Device,
} from "@/components/design/device-tabs";

type DesignKind = "landing" | "dashboard" | "email" | "card" | "custom";
type DesignTheme = "dark" | "light" | "brand";

type Design = {
  html: string;
  title: string;
  kind: DesignKind;
  theme: DesignTheme;
};

const KINDS: DesignKind[] = ["landing", "dashboard", "email", "card", "custom"];
const THEMES: DesignTheme[] = ["light", "dark", "brand"];

function slugify(s: string): string {
  return (
    s
      .replace(/[^\w\s-]+/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "design"
  );
}

function embedCode(html: string): string {
  // A convenient snippet users can paste into their own site: a sandboxed
  // iframe whose srcdoc is the design HTML, HTML-escaped.
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<iframe sandbox="allow-scripts" style="width:100%;height:800px;border:0" srcdoc="${escaped}"></iframe>`;
}

export function DesignStudio() {
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<DesignKind>("landing");
  const [theme, setTheme] = useState<DesignTheme>("light");
  const [variations, setVariations] = useState(1);
  const [isGenerating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [designs, setDesigns] = useState<Design[]>([]);
  const [device, setDevice] = useState<Device>("desktop");

  const [refineIndex, setRefineIndex] = useState<number | null>(null);
  const [refineText, setRefineText] = useState("");
  const [isRefining, setRefining] = useState(false);

  const canGenerate = prompt.trim().length > 0 && !isGenerating;

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/design/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-guest-mode": "1",
        },
        body: JSON.stringify({ prompt, kind, theme, variations }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Generate failed (${res.status}): ${txt}`);
      }
      const json = (await res.json()) as { designs: Design[] };
      setDesigns(json.designs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [prompt, kind, theme, variations]);

  const download = useCallback((design: Design) => {
    const blob = new Blob([design.html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, `${slugify(design.title)}.html`);
  }, []);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Minimal feedback — full toast system already exists but we avoid
      // extra coupling for this screen.
      setError(`${label} copied to clipboard.`);
      setTimeout(() => setError(null), 1500);
    } catch {
      setError("Copy failed — your browser may have blocked clipboard access.");
    }
  }, []);

  const openInNewTab = useCallback((design: Design) => {
    const blob = new Blob([design.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  /**
   * PNG export stub.
   *
   * TODO: swap the dynamic import target to a server route that runs
   * headless Puppeteer (chrome-aws-lambda or @sparticuz/chromium + puppeteer-core)
   * so serverless deployments can render the sandboxed iframe to a PNG.
   * Client-side html2canvas can't see inside an `allow-scripts`-only iframe,
   * so we intentionally fall back to "Open in new tab" here.
   */
  const exportPng = useCallback(
    (design: Design) => {
      openInNewTab(design);
      setError(
        "PNG export: opened in a new tab — use your browser's screenshot tool for now.",
      );
      setTimeout(() => setError(null), 3000);
    },
    [openInNewTab],
  );

  const openRefine = useCallback((i: number) => {
    setRefineIndex(i);
    setRefineText("");
  }, []);

  const runRefine = useCallback(async () => {
    if (refineIndex === null) return;
    const target = designs[refineIndex];
    if (!target) return;
    const instruction = refineText.trim();
    if (!instruction) return;
    setRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/design/refine", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-guest-mode": "1",
        },
        body: JSON.stringify({ html: target.html, instruction }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Refine failed (${res.status}): ${txt}`);
      }
      const json = (await res.json()) as { html: string };
      setDesigns((prev) => {
        const next = prev.slice();
        const cur = next[refineIndex];
        if (!cur) return prev;
        next[refineIndex] = { ...cur, html: json.html };
        return next;
      });
      setRefineIndex(null);
      setRefineText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefining(false);
    }
  }, [refineIndex, refineText, designs]);

  const previewWidth = DEVICE_WIDTHS[device];

  return (
    <div className="space-y-8">
      {/* Prompt form */}
      <section className="rounded-lg border p-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="design-prompt">Describe your design</Label>
          <Textarea
            id="design-prompt"
            rows={3}
            placeholder='e.g. "a sleek SaaS landing page for a legal-AI product, with 3 pricing tiers and a testimonial grid"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="design-kind">Kind</Label>
            <select
              id="design-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as DesignKind)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="design-theme">Theme</Label>
            <select
              id="design-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value as DesignTheme)}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            >
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="design-variations">
              Variations ({variations})
            </Label>
            <input
              id="design-variations"
              type="range"
              min={1}
              max={3}
              value={variations}
              onChange={(e) => setVariations(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={generate} disabled={!canGenerate}>
            {isGenerating
              ? "Generating…"
              : variations > 1
                ? `Generate ${variations} variations`
                : "Generate"}
          </Button>
          {designs.length > 0 ? (
            <div className="ms-auto flex items-center gap-2">
              <span className="text-xs text-neutral-500">Preview:</span>
              <DeviceTabs value={device} onChange={setDevice} />
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {/* Results grid */}
      {designs.length > 0 ? (
        <section
          className={
            designs.length === 1
              ? "grid gap-6"
              : "grid gap-6 md:grid-cols-2 xl:grid-cols-3"
          }
        >
          {designs.map((design, i) => (
            <article
              key={i}
              className="rounded-lg border bg-white/5 p-3 space-y-3"
            >
              <header className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium" title={design.title}>
                    {design.title}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {design.kind} · {design.theme}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-neutral-400">
                  #{i + 1}
                </span>
              </header>
              <div className="overflow-auto rounded-md border bg-neutral-100/40 p-2">
                <PreviewIframe
                  html={design.html}
                  width={previewWidth}
                  maxHeight={720}
                  title={`${design.title} preview`}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => download(design)}>
                  Download .html
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(design.html, "HTML")}
                >
                  Copy HTML
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copy(embedCode(design.html), "Embed code")}
                >
                  Copy embed
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openInNewTab(design)}
                >
                  Open in new tab
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportPng(design)}>
                  Export .png
                </Button>
                <Button size="sm" onClick={() => openRefine(i)}>
                  Refine
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {/* Refine drawer */}
      <Sheet
        open={refineIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRefineIndex(null);
            setRefineText("");
          }
        }}
      >
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Refine design</SheetTitle>
            <SheetDescription>
              Describe the edit in plain English. The current HTML is sent
              alongside your instruction and returned updated in place.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Label htmlFor="refine-instruction">Instruction</Label>
            <Textarea
              id="refine-instruction"
              rows={6}
              placeholder='e.g. "change the hero background to a gradient from indigo to purple"'
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
            />
          </div>
          <SheetFooter className="mt-6 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRefineIndex(null);
                setRefineText("");
              }}
              disabled={isRefining}
            >
              Cancel
            </Button>
            <Button onClick={runRefine} disabled={isRefining || !refineText.trim()}>
              {isRefining ? "Refining…" : "Apply refinement"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
