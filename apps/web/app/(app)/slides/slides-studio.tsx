"use client";

/**
 * Client-side slides studio.
 *
 * - Form: topic / audience / tone / numSlides.
 * - Generate: POST /api/slides/generate → local `deck` state.
 * - Preview grid: title + first 3 bullets per slide; click to edit.
 * - Editor drawer: Sheet with title/bullets/notes/layout editors.
 * - "Open as reveal.js": POST /api/slides/render, open blob URL in new tab.
 * - "Download .html": same render, but triggers a download.
 */
import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Input,
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

type SlideLayout = "title" | "content" | "two-column" | "quote" | "closing";

type Slide = {
  title: string;
  bullets: string[];
  speakerNotes?: string;
  layout: SlideLayout;
};

type Deck = {
  title: string;
  subtitle?: string;
  slides: Slide[];
};

const LAYOUTS: SlideLayout[] = [
  "title",
  "content",
  "two-column",
  "quote",
  "closing",
];

export function SlidesStudio() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("confident, concise");
  const [numSlides, setNumSlides] = useState(8);
  const [isGenerating, setGenerating] = useState(false);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isRendering, setRendering] = useState(false);

  const canGenerate = topic.trim().length > 0 && !isGenerating;
  const canRender = deck !== null && !isRendering;

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/slides/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-guest-mode": "1",
        },
        body: JSON.stringify({
          topic,
          audience: audience || undefined,
          tone: tone || undefined,
          numSlides,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Generate failed (${res.status}): ${txt}`);
      }
      const json = (await res.json()) as { deck: Deck };
      setDeck(json.deck);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }, [topic, audience, tone, numSlides]);

  const fetchRendered = useCallback(async (): Promise<Blob | null> => {
    if (!deck) return null;
    setRendering(true);
    setError(null);
    try {
      const res = await fetch("/api/slides/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deck, theme: "dark" }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Render failed (${res.status}): ${txt}`);
      }
      return await res.blob();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setRendering(false);
    }
  }, [deck]);

  const openRevealJs = useCallback(async () => {
    const blob = await fetchRendered();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Revoke on next tick; the new tab will have its own copy.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [fetchRendered]);

  const downloadHtml = useCallback(async () => {
    const blob = await fetchRendered();
    if (!blob || !deck) return;
    const name =
      deck.title.replace(/[^\w\s-]+/g, "").replace(/\s+/g, "-").slice(0, 60) ||
      "deck";
    downloadBlob(blob, `${name}.html`);
  }, [fetchRendered, deck]);

  const updateSlide = useCallback((index: number, patch: Partial<Slide>) => {
    setDeck((d) => {
      if (!d) return d;
      const slides = d.slides.slice();
      const current = slides[index];
      if (!current) return d;
      slides[index] = { ...current, ...patch };
      return { ...d, slides };
    });
  }, []);

  const editing = useMemo<Slide | null>(
    () =>
      editingIndex !== null && deck ? (deck.slides[editingIndex] ?? null) : null,
    [editingIndex, deck],
  );

  return (
    <div className="space-y-8">
      {/* Generation form */}
      <section className="rounded-lg border p-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="slides-topic">Topic</Label>
            <Input
              id="slides-topic"
              placeholder="e.g. Q3 product strategy for enterprise AI"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slides-audience">Audience</Label>
            <Input
              id="slides-audience"
              placeholder="e.g. exec team"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slides-tone">Tone</Label>
            <Input
              id="slides-tone"
              placeholder="e.g. crisp, confident"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slides-count">Number of slides ({numSlides})</Label>
            <input
              id="slides-count"
              type="range"
              min={3}
              max={20}
              value={numSlides}
              onChange={(e) => setNumSlides(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={generate} disabled={!canGenerate}>
            {isGenerating ? "Generating…" : "Generate"}
          </Button>
          {deck ? (
            <>
              <Button
                variant="outline"
                onClick={openRevealJs}
                disabled={!canRender}
              >
                Open as reveal.js
              </Button>
              <Button
                variant="outline"
                onClick={downloadHtml}
                disabled={!canRender}
              >
                Download .html
              </Button>
            </>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {/* Preview grid */}
      {deck ? (
        <section>
          <header className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-semibold">{deck.title}</h2>
              {deck.subtitle ? (
                <p className="text-sm text-neutral-500">{deck.subtitle}</p>
              ) : null}
            </div>
            <span className="text-xs text-neutral-500">
              {deck.slides.length} slides · click to edit
            </span>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deck.slides.map((slide, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setEditingIndex(i)}
                className="rounded-lg border bg-white/5 p-4 text-start hover:border-neutral-400 transition-colors"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {i + 1} · {slide.layout}
                  </span>
                </div>
                <h3 className="mb-2 font-medium">{slide.title}</h3>
                <ul className="list-disc ps-5 text-sm text-neutral-600 space-y-1">
                  {slide.bullets.slice(0, 3).map((b, bi) => (
                    <li key={bi} className="line-clamp-2">
                      {b}
                    </li>
                  ))}
                  {slide.bullets.length > 3 ? (
                    <li className="text-neutral-400">
                      +{slide.bullets.length - 3} more
                    </li>
                  ) : null}
                </ul>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Edit drawer */}
      <Sheet
        open={editingIndex !== null}
        onOpenChange={(open) => {
          if (!open) setEditingIndex(null);
        }}
      >
        <SheetContent className="sm:max-w-lg">
          {editing && editingIndex !== null ? (
            <>
              <SheetHeader>
                <SheetTitle>Slide {editingIndex + 1}</SheetTitle>
                <SheetDescription>
                  Edits apply to the live preview and the exported deck.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={editing.title}
                    onChange={(e) =>
                      updateSlide(editingIndex, { title: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-layout">Layout</Label>
                  <select
                    id="edit-layout"
                    value={editing.layout}
                    onChange={(e) =>
                      updateSlide(editingIndex, {
                        layout: e.target.value as SlideLayout,
                      })
                    }
                    className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  >
                    {LAYOUTS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-bullets">Bullets (one per line)</Label>
                  <Textarea
                    id="edit-bullets"
                    rows={8}
                    value={editing.bullets.join("\n")}
                    onChange={(e) =>
                      updateSlide(editingIndex, {
                        bullets: e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter((s) => s.length > 0),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-notes">Speaker notes</Label>
                  <Textarea
                    id="edit-notes"
                    rows={3}
                    value={editing.speakerNotes ?? ""}
                    onChange={(e) =>
                      updateSlide(editingIndex, {
                        speakerNotes: e.target.value || undefined,
                      })
                    }
                  />
                </div>
              </div>
              <SheetFooter className="mt-6">
                <Button
                  variant="outline"
                  onClick={() => setEditingIndex(null)}
                >
                  Done
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
