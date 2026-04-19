/**
 * POST /api/docs/export
 *
 * Exports a markdown document as one of:
 *   - md:   raw markdown (text/markdown)
 *   - html: HTML rendered via `marked` wrapped in a minimal styled shell
 *   - pdf:  PDF rendered via `@react-pdf/renderer` with a simple
 *           typographic mapping for H1-H6 + paragraph + list + code +
 *           blockquote.
 *
 * The response is a file download with an appropriate Content-Type and
 * Content-Disposition header.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@sparkflow/auth";
import { captureError, incr, logger } from "@sparkflow/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  markdown: z.string().min(1),
  format: z.enum(["md", "html", "pdf"]),
  title: z.string().max(300).optional(),
});

function safeFilename(name: string, ext: string): string {
  const base = (name || "document")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${base || "document"}.${ext}`;
}

function htmlShell(title: string, bodyHtml: string): string {
  // Minimal typographic shell. Kept intentionally plain so users can
  // paste into Notion / Gmail / LMS rich-text editors without fighting
  // a corporate theme.
  return `<!doctype html>
<html lang="auto">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #111; }
  h1,h2,h3,h4,h5,h6 { line-height: 1.25; }
  h1 { font-size: 2rem; margin-top: 0; }
  h2 { font-size: 1.5rem; margin-top: 2rem; }
  h3 { font-size: 1.2rem; margin-top: 1.5rem; }
  pre { background: #0b1020; color: #e6edf3; padding: 1rem; border-radius: 8px; overflow: auto; }
  code { background: #f2f2f2; padding: 0.1em 0.35em; border-radius: 4px; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-inline-start: 4px solid #ddd; margin: 1rem 0; padding: 0.25rem 1rem; color: #555; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; }
  img { max-width: 100%; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderHtml(markdown: string, title: string): Promise<string> {
  const { marked } = await import("marked");
  const body = await marked.parse(markdown, { async: true, gfm: true });
  return htmlShell(title, String(body));
}

/**
 * Extremely small markdown → structured-blocks parser used only for the
 * PDF renderer. It does NOT aim to be a full markdown parser — just
 * enough to cover H1-H6, paragraphs, bullet lists, numbered lists,
 * fenced code blocks, and blockquotes. Anything it doesn't recognise
 * becomes a paragraph.
 */
type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; items: string[] }
  | { kind: "number"; items: string[] }
  | { kind: "code"; text: string; lang?: string }
  | { kind: "quote"; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  const at = (idx: number): string => lines[idx] ?? "";

  while (i < lines.length) {
    const line = at(i);

    // Fenced code
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(at(i))) {
        buf.push(at(i));
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      const codeBlock: Block = lang
        ? { kind: "code", text: buf.join("\n"), lang }
        : { kind: "code", text: buf.join("\n") };
      blocks.push(codeBlock);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h && h[1] && h[2]) {
      blocks.push({
        kind: "heading",
        level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: h[2].trim(),
      });
      i++;
      continue;
    }

    // Blockquote (consume contiguous > lines)
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(at(i))) {
        buf.push(at(i).replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join(" ").trim() });
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(at(i))) {
        items.push(at(i).replace(/^\s*[-*+]\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "bullet", items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(at(i))) {
        items.push(at(i).replace(/^\s*\d+\.\s+/, "").trim());
        i++;
      }
      blocks.push({ kind: "number", items });
      continue;
    }

    // Blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — coalesce until blank or block-start line
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      at(i).trim() &&
      !/^#{1,6}\s+/.test(at(i)) &&
      !/^```/.test(at(i)) &&
      !/^>\s?/.test(at(i)) &&
      !/^\s*[-*+]\s+/.test(at(i)) &&
      !/^\s*\d+\.\s+/.test(at(i))
    ) {
      buf.push(at(i));
      i++;
    }
    blocks.push({ kind: "paragraph", text: buf.join(" ").trim() });
  }

  return blocks;
}

// Register Noto Sans Hebrew once per server process. @react-pdf/renderer's
// default Helvetica PDF font only has a Latin glyph set, so Hebrew
// markdown exported to PDF shows up as boxes / Latin-fallback garbage.
// Noto Sans Hebrew covers Hebrew + Latin, so we use it as the default
// `fontFamily` whenever the document contains any Hebrew code points.
const NOTO_HEB_REGULAR =
  "https://fonts.gstatic.com/s/notosanshebrew/v50/or3HQ7v33eiDljA1IufXTtVf7V6RvEEdhQlk0LlGxCyaeNKYZC0sqk3xXGiXd4qtog.ttf";
const NOTO_HEB_BOLD =
  "https://fonts.gstatic.com/s/notosanshebrew/v50/or3HQ7v33eiDljA1IufXTtVf7V6RvEEdhQlk0LlGxCyaeNKYZC0sqk3xXGiXkI2tog.ttf";

let hebrewFontRegistered = false;
async function ensureHebrewFont(): Promise<void> {
  if (hebrewFontRegistered) return;
  const { Font } = await import("@react-pdf/renderer");
  Font.register({
    family: "NotoSansHebrew",
    fonts: [
      { src: NOTO_HEB_REGULAR, fontWeight: 400 },
      { src: NOTO_HEB_BOLD, fontWeight: 700 },
    ],
  });
  hebrewFontRegistered = true;
}

function containsHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}

async function renderPdf(markdown: string, title: string): Promise<Buffer> {
  // Dynamic imports to keep the module graph small and avoid pulling
  // react-pdf into the Edge bundler.
  const [{ Document, Page, Text, View, StyleSheet, pdf }, React] =
    await Promise.all([import("@react-pdf/renderer"), import("react")]);

  const needsHebrew = containsHebrew(markdown) || containsHebrew(title);
  if (needsHebrew) {
    await ensureHebrewFont();
  }
  const bodyFont = needsHebrew ? "NotoSansHebrew" : "Helvetica";
  const codeFont = needsHebrew ? "NotoSansHebrew" : "Courier";

  const styles = StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 48,
      paddingHorizontal: 56,
      fontFamily: bodyFont,
      fontSize: 11,
      lineHeight: 1.5,
      color: "#111",
    },
    title: { fontSize: 22, fontWeight: 700, marginBottom: 12 },
    h1: { fontSize: 20, fontWeight: 700, marginTop: 18, marginBottom: 8 },
    h2: { fontSize: 16, fontWeight: 700, marginTop: 16, marginBottom: 6 },
    h3: { fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 4 },
    h4: { fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 4 },
    paragraph: { marginBottom: 6 },
    listItem: { marginBottom: 3, flexDirection: "row" },
    listBullet: { width: 14 },
    listText: { flex: 1 },
    code: {
      fontFamily: codeFont,
      fontSize: 10,
      backgroundColor: "#f4f4f5",
      padding: 8,
      marginVertical: 6,
      borderRadius: 4,
    },
    quote: {
      borderLeftWidth: 3,
      borderLeftColor: "#ccc",
      paddingLeft: 10,
      marginVertical: 6,
      color: "#444",
      fontStyle: "italic",
    },
  });

  const blocks = parseBlocks(markdown);

  const children: React.ReactNode[] = [];
  if (title) {
    children.push(React.createElement(Text, { style: styles.title, key: "title" }, title));
  }

  blocks.forEach((b, idx) => {
    const key = `b${idx}`;
    switch (b.kind) {
      case "heading": {
        const style =
          b.level === 1 ? styles.h1 :
          b.level === 2 ? styles.h2 :
          b.level === 3 ? styles.h3 :
          styles.h4;
        children.push(React.createElement(Text, { style, key }, b.text));
        break;
      }
      case "paragraph":
        children.push(React.createElement(Text, { style: styles.paragraph, key }, b.text));
        break;
      case "bullet":
        b.items.forEach((it, j) =>
          children.push(
            React.createElement(
              View,
              { style: styles.listItem, key: `${key}-${j}` },
              React.createElement(Text, { style: styles.listBullet }, "• "),
              React.createElement(Text, { style: styles.listText }, it),
            ),
          ),
        );
        break;
      case "number":
        b.items.forEach((it, j) =>
          children.push(
            React.createElement(
              View,
              { style: styles.listItem, key: `${key}-${j}` },
              React.createElement(Text, { style: styles.listBullet }, `${j + 1}.`),
              React.createElement(Text, { style: styles.listText }, it),
            ),
          ),
        );
        break;
      case "code":
        children.push(React.createElement(Text, { style: styles.code, key }, b.text));
        break;
      case "quote":
        children.push(React.createElement(Text, { style: styles.quote, key }, b.text));
        break;
    }
  });

  const doc = React.createElement(
    Document,
    null,
    React.createElement(Page, { size: "A4", style: styles.page }, ...children),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = pdf(doc as any);
  const blob = await instance.toBlob();
  const arrayBuf = await blob.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      const session = await getSession();
      if (!session) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const title = parsed.title ?? "Document";

    incr("docs.export", { format: parsed.format });

    if (parsed.format === "md") {
      return new NextResponse(parsed.markdown, {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${safeFilename(title, "md")}"`,
        },
      });
    }

    if (parsed.format === "html") {
      const html = await renderHtml(parsed.markdown, title);
      return new NextResponse(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `attachment; filename="${safeFilename(title, "html")}"`,
        },
      });
    }

    // pdf
    const buffer = await renderPdf(parsed.markdown, title);
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${safeFilename(title, "pdf")}"`,
        "content-length": String(body.byteLength),
      },
    });
  } catch (err) {
    captureError(err, { route: "api/docs/export" });
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "api.docs.export.failed",
    );
    const message = err instanceof Error ? err.message : "internal_error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
