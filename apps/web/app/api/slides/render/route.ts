/**
 * POST /api/slides/render
 *
 * Takes a validated `SlideDeck` plus an optional theme and renders a
 * self-contained reveal.js HTML file. The file pulls reveal.js + a theme
 * from a CDN and inlines everything else, so the user can double-click
 * the downloaded file and present offline-ish (requires network for the
 * CDN the first time, then cached).
 *
 * Bullets are parsed with `marked` so a deck author can use markdown.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { marked } from "marked";
import { slideDeckSchema, type SlideDeck } from "../generate/route";

export const runtime = "nodejs";

const themeSchema = z.enum(["dark", "light", "brand"]).optional();

const requestSchema = z.object({
  deck: slideDeckSchema,
  theme: themeSchema,
});

type Theme = "dark" | "light" | "brand";

const REVEAL_VERSION = "5.1.0";

function revealThemeHref(theme: Theme): string {
  // reveal.js ships a few first-party themes. For "brand" we use a neutral
  // slate-ish one and layer our own accent on top via inline CSS.
  const themeFile =
    theme === "light" ? "white" : theme === "brand" ? "league" : "black";
  return `https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/theme/${themeFile}.css`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBulletsHtml(bullets: string[]): string {
  if (bullets.length === 0) return "";
  const items = bullets
    .map((b) => {
      // `marked.parseInline` returns the inline-rendered markdown (no <p>
      // wrapping), which is what we want inside <li>.
      const html = marked.parseInline(b) as string;
      return `<li>${html}</li>`;
    })
    .join("\n");
  return `<ul>\n${items}\n</ul>`;
}

function renderSlide(slide: SlideDeck["slides"][number]): string {
  const title = escapeHtml(slide.title);
  const bullets = renderBulletsHtml(slide.bullets);
  const notes = slide.speakerNotes
    ? `<aside class="notes">${escapeHtml(slide.speakerNotes)}</aside>`
    : "";

  switch (slide.layout) {
    case "title":
      return `<section class="layout-title">
  <h1>${title}</h1>
  ${bullets ? `<div class="subtitle">${bullets}</div>` : ""}
  ${notes}
</section>`;
    case "two-column": {
      const midpoint = Math.ceil(slide.bullets.length / 2);
      const left = renderBulletsHtml(slide.bullets.slice(0, midpoint));
      const right = renderBulletsHtml(slide.bullets.slice(midpoint));
      return `<section class="layout-two-column">
  <h2>${title}</h2>
  <div class="two-col">
    <div class="col">${left}</div>
    <div class="col">${right}</div>
  </div>
  ${notes}
</section>`;
    }
    case "quote": {
      const quote = slide.bullets[0] ? escapeHtml(slide.bullets[0]) : "";
      const attribution = slide.bullets[1]
        ? `<footer>— ${escapeHtml(slide.bullets[1])}</footer>`
        : "";
      return `<section class="layout-quote">
  <blockquote>
    <p>${quote}</p>
    ${attribution}
  </blockquote>
  ${notes}
</section>`;
    }
    case "closing":
      return `<section class="layout-closing">
  <h2>${title}</h2>
  ${bullets}
  ${notes}
</section>`;
    case "content":
    default:
      return `<section class="layout-content">
  <h2>${title}</h2>
  ${bullets}
  ${notes}
</section>`;
  }
}

function renderHtml(deck: SlideDeck, theme: Theme): string {
  const subtitleHtml = deck.subtitle
    ? `<p class="deck-subtitle">${escapeHtml(deck.subtitle)}</p>`
    : "";
  const sections = deck.slides.map(renderSlide).join("\n");
  const themeHref = revealThemeHref(theme);
  const accent =
    theme === "brand"
      ? "#7c3aed"
      : theme === "light"
        ? "#2563eb"
        : "#60a5fa";

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1024, initial-scale=1" />
<title>${escapeHtml(deck.title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/reveal.css" />
<link rel="stylesheet" href="${themeHref}" />
<style>
  :root { --accent: ${accent}; }
  .reveal h1, .reveal h2 { text-transform: none; letter-spacing: -0.01em; }
  .reveal h2 { border-bottom: 2px solid var(--accent); padding-bottom: 0.2em; display: inline-block; }
  .reveal .layout-title h1 { font-size: 2.6em; }
  .reveal .deck-subtitle { opacity: 0.8; margin-top: 0.5em; }
  .reveal .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; text-align: start; }
  .reveal .two-col .col ul { margin: 0; }
  .reveal blockquote { border-inline-start: 4px solid var(--accent); padding: 0.5em 1em; font-style: italic; }
  .reveal blockquote footer { margin-top: 0.5em; font-size: 0.7em; opacity: 0.8; font-style: normal; }
  .reveal .layout-closing { text-align: center; }
  .reveal ul { text-align: start; }
</style>
</head>
<body>
<div class="reveal">
  <div class="slides">
    ${subtitleHtml ? `<section><h1>${escapeHtml(deck.title)}</h1>${subtitleHtml}</section>` : ""}
    ${sections}
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/reveal.js"></script>
<script>
  // eslint-disable-next-line no-undef
  Reveal.initialize({ hash: true, slideNumber: true, transition: "slide" });
</script>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const theme: Theme = parsed.theme ?? "dark";
    const html = renderHtml(parsed.deck, theme);
    const filenameSafe = parsed.deck.title
      .replace(/[^\w\s-]+/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "deck";
    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `attachment; filename="${filenameSafe}.html"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
