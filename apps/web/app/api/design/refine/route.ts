/**
 * POST /api/design/refine
 *
 * Takes an existing AI-generated HTML document and applies a targeted edit
 * described in natural language (e.g. "change the hero background to a
 * gradient from indigo to purple"). Returns the updated document.
 *
 * The refined document must remain a complete, self-contained `<!DOCTYPE
 * html>` page — the same guarantees as /api/design/generate so the client
 * can drop it straight into the iframe preview.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generate } from "@sparkflow/llm";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  html: z.string().min(20),
  instruction: z.string().min(1),
});

const TAILWIND_CDN = "https://cdn.tailwindcss.com";
const INTER_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap";
const LUCIDE_SRC = "https://unpkg.com/lucide-static@latest/font/lucide.css";

function unfence(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:html)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fence?.[1] ? fence[1].trim() : trimmed;
}

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

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      await requireSession();
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const system = [
      "You are an elite product designer editing an existing HTML document.",
      "Apply the user's requested change as a surgical edit: preserve all unrelated content and structure.",
      "",
      "Hard rules — violate none of these:",
      "- Output ONLY the updated HTML document. No commentary, no markdown fences.",
      "- Start with `<!DOCTYPE html>` and end with `</html>`.",
      "- Keep the document self-contained and Tailwind-CDN driven; do not introduce external CSS/JS beyond what's already there.",
      "- Do not rewrite sections the user did not ask to change.",
    ].join("\n");

    const user = [
      `Instruction: ${parsed.instruction}`,
      "",
      "Current HTML document:",
      parsed.html,
      "",
      "Return the full updated HTML document.",
    ].join("\n");

    const result = await generate({
      system,
      messages: [{ id: crypto.randomUUID(), role: "user", content: user }],
      temperature: 0.3,
      maxTokens: 4000,
    });

    const html = ensureAssets(extractHtml(result.content));
    return NextResponse.json({ html });
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
