/**
 * POST /api/design/generate
 *
 * AI Designer — generates one or more self-contained HTML documents that
 * implement a web design described by a freeform prompt. Each document is
 * a complete `<!DOCTYPE html>` page that can be rendered directly in an
 * iframe or downloaded as a .html file.
 *
 * The returned HTML loads Tailwind via its official play-CDN, Inter from
 * Google Fonts, and lucide-static for icons — so it renders the same
 * design in a sandboxed iframe preview and on disk without a build step.
 *
 * Auth: `requireSession` with an explicit `x-guest-mode: 1` bypass so the
 * marketing demo and smoke tests keep working without a real session.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generate } from "@sparkflow/llm";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const kindSchema = z
  .enum(["landing", "dashboard", "email", "card", "custom"])
  .default("landing");
const themeSchema = z.enum(["dark", "light", "brand"]).default("light");

const requestSchema = z.object({
  prompt: z.string().min(1),
  kind: kindSchema.optional(),
  theme: themeSchema.optional(),
  variations: z.number().int().min(1).max(4).optional(),
});

export type DesignKind = z.infer<typeof kindSchema>;
export type DesignTheme = z.infer<typeof themeSchema>;

export type Design = {
  html: string;
  title: string;
  kind: DesignKind;
  theme: DesignTheme;
};

const TAILWIND_CDN = "https://cdn.tailwindcss.com";
const INTER_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap";
const LUCIDE_SRC = "https://unpkg.com/lucide-static@latest/font/lucide.css";

/**
 * Strip the first fenced code block (```html ... ```) if the model wrapped
 * its output in one. Falls through untouched when no fence is present.
 */
function unfence(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:html)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fence?.[1] ? fence[1].trim() : trimmed;
}

/**
 * Isolate the `<!DOCTYPE html> ... </html>` substring from the model output.
 * Many providers include a short preamble ("Sure, here is ...") before the
 * document; the slice below drops it without affecting well-formed output.
 */
function extractHtml(raw: string): string {
  const src = unfence(raw);
  const doctypeIdx = src.search(/<!DOCTYPE\s+html/i);
  const htmlOpen = src.search(/<html[\s>]/i);
  const start = doctypeIdx >= 0 ? doctypeIdx : htmlOpen;
  if (start < 0) return src;
  const endIdx = src.lastIndexOf("</html>");
  const end = endIdx >= 0 ? endIdx + "</html>".length : src.length;
  return src.slice(start, end).trim();
}

/**
 * Idempotently inject Tailwind CDN, Inter, and lucide icon fonts into the
 * `<head>` so the document renders correctly in a sandboxed iframe even if
 * the model forgot them.
 */
function ensureAssets(html: string): string {
  let out = html;
  if (!/cdn\.tailwindcss\.com/i.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}\n<script src="${TAILWIND_CDN}"></script>`,
    );
  }
  if (!/fonts\.googleapis\.com\/css2\?family=Inter/i.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      (m) =>
        `${m}\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
        `\n<link href="${INTER_HREF}" rel="stylesheet">`,
    );
  }
  if (!/lucide/i.test(out)) {
    out = out.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}\n<link href="${LUCIDE_SRC}" rel="stylesheet">`,
    );
  }
  return out;
}

/**
 * Pull the `<title>…</title>` out of the generated document so the client
 * can show a sensible label next to the preview.
 */
function extractTitle(html: string, fallback: string): string {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const t = m?.[1]?.trim();
  return t && t.length > 0 ? t : fallback;
}

function systemPrompt(kind: DesignKind, theme: DesignTheme): string {
  return [
    "You are an elite product designer and front-end engineer.",
    "Produce ONE complete, self-contained HTML document implementing the user's requested design.",
    "",
    "Hard rules — violate none of these:",
    "- Output ONLY the HTML document. No commentary, no prose, no markdown fences.",
    "- Start with `<!DOCTYPE html>` and end with `</html>`.",
    `- Include <script src="${TAILWIND_CDN}"></script> in <head> and use Tailwind utility classes for ALL styling.`,
    `- Load Inter via <link href="${INTER_HREF}" rel="stylesheet"> and apply it through a Tailwind body class.`,
    `- Load lucide icon font via <link href="${LUCIDE_SRC}" rel="stylesheet"> and use <i class="lucide lucide-..."> spans where icons are appropriate.`,
    "- Use semantic HTML (header/nav/main/section/footer) and accessible labels/alt text.",
    "- Copy must be real, specific, and vivid — never lorem ipsum.",
    "- No external images. Use CSS gradients, Tailwind shapes, and lucide icons for visuals.",
    "- No inline <script> beyond the Tailwind CDN script.",
    "",
    `Design kind: ${kind}.`,
    `Theme: ${theme} — ${themeGuidance(theme)}`,
    kindGuidance(kind),
  ].join("\n");
}

function themeGuidance(theme: DesignTheme): string {
  switch (theme) {
    case "dark":
      return "dark mode; use `bg-neutral-950`, `text-neutral-100`, and subtle neutral-800 borders; accent with indigo-400/violet-400.";
    case "brand":
      return "on-brand high-contrast; use an indigo → violet → fuchsia gradient palette with white text on dark sections.";
    case "light":
    default:
      return "light mode; use `bg-white`, `text-neutral-900`, neutral-200 borders; accent with indigo-600.";
  }
}

function kindGuidance(kind: DesignKind): string {
  switch (kind) {
    case "landing":
      return "Build a marketing landing page: sticky nav, hero with headline + sub + primary/secondary CTA, logo cloud, 3 feature cards with icons, testimonial, pricing (3 tiers), FAQ, CTA band, footer.";
    case "dashboard":
      return "Build an app dashboard shell: left sidebar with navigation, top bar with search + avatar, main area with 4 stat cards, a chart placeholder (SVG), a recent-activity table, and a side panel.";
    case "email":
      return "Build a transactional email: 600px centered table-style layout implemented with divs, logo, headline, body copy, single CTA button, secondary actions, footer with unsubscribe/legal.";
    case "card":
      return "Build a single, tightly-composed card component centered on the page — rich, dense, with icon, title, body, metadata row, and primary action.";
    case "custom":
    default:
      return "Interpret the user's prompt as the spec; pick a sensible canonical layout for it.";
  }
}

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      await requireSession();
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const kind: DesignKind = parsed.kind ?? "landing";
    const theme: DesignTheme = parsed.theme ?? "light";
    const variations = parsed.variations ?? 1;

    const system = systemPrompt(kind, theme);

    // Nudge each variation down a different design path so "Variations"
    // actually yields visibly different layouts rather than three near-dupes.
    const variationHints = [
      "Canonical, trusted, minimal — lots of whitespace.",
      "Bold, editorial, high-contrast with oversized type and asymmetric layout.",
      "Playful, rounded, soft-gradient surfaces with colourful accents.",
      "Utilitarian and dense — information-rich, tight vertical rhythm.",
    ];

    const designs = await Promise.all(
      Array.from({ length: variations }).map(async (_v, i) => {
        const user = [
          `Prompt: ${parsed.prompt}`,
          variations > 1 ? `Design direction: ${variationHints[i % variationHints.length]}` : undefined,
          "Return ONLY the HTML document.",
        ]
          .filter(Boolean)
          .join("\n");

        const result = await generate({
          system,
          messages: [{ id: crypto.randomUUID(), role: "user", content: user }],
          temperature: 0.7,
          maxTokens: 4000,
        });

        const html = ensureAssets(extractHtml(result.content));
        const title = extractTitle(
          html,
          `${kind.charAt(0).toUpperCase()}${kind.slice(1)} · ${theme}`,
        );
        return { html, title, kind, theme } satisfies Design;
      }),
    );

    return NextResponse.json({ designs });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status) || 500
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
