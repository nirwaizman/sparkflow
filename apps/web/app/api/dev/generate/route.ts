/**
 * POST /api/dev/generate
 *
 * Coder-oriented generation for the AI Developer studio. Takes the current
 * project files + a user prompt, asks the LLM to produce a structured diff
 * (create/update/delete), and returns it along with a human-readable
 * explanation. The client applies the diff to editor state on accept.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generate } from "@sparkflow/llm";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const fileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const requestSchema = z.object({
  prompt: z.string().min(1),
  files: z.array(fileSchema).optional(),
  language: z.enum(["ts", "js", "python"]).optional(),
});

type DiffAction = "create" | "update" | "delete";

type DiffFile = {
  path: string;
  content: string;
  action: DiffAction;
};

type GenerateResponse = {
  files: DiffFile[];
  explanation: string;
};

const SYSTEM_PROMPT = [
  "You are an expert software engineer acting as a pair-programming assistant in an in-browser IDE.",
  "You are given the current project file tree (paths + full contents) and a user request.",
  "Your job: propose a minimal, correct set of file changes that satisfies the request.",
  "",
  "Output format (STRICT): reply with a single fenced ```json block containing an object:",
  "{",
  '  "explanation": "<short plain-language summary of what you changed and why>",',
  '  "files": [',
  '    { "path": "relative/path.ext", "action": "create" | "update" | "delete", "content": "<full new file contents, or empty string for delete>" }',
  "  ]",
  "}",
  "",
  "Rules:",
  "- `content` must be the FULL new file contents, not a patch/diff.",
  "- Only include files you are changing. Do not echo unchanged files.",
  "- Use relative paths (no leading slash). Prefer existing directory conventions.",
  "- For `delete`, set `content` to an empty string.",
  "- Keep changes minimal, idiomatic, and production-ready. Include tests only if asked.",
  "- Do not include commentary outside the JSON block.",
].join("\n");

function buildUserMessage(
  prompt: string,
  files: Array<{ path: string; content: string }>,
  language: "ts" | "js" | "python" | undefined,
): string {
  const langLine = language
    ? `Primary language: ${language === "ts" ? "TypeScript" : language === "js" ? "JavaScript (Node.js)" : "Python"}.`
    : "Primary language: inferred from existing files.";

  const tree = files.length
    ? files
        .map(
          (f) =>
            `--- FILE: ${f.path} ---\n${f.content.length > 8000 ? f.content.slice(0, 8000) + "\n/* ...truncated... */" : f.content}`,
        )
        .join("\n\n")
    : "(empty project)";

  return [
    langLine,
    "",
    "Current project files:",
    tree,
    "",
    "User request:",
    prompt,
  ].join("\n");
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const fencedAny = text.match(/```\s*([\s\S]*?)```/);
  if (fencedAny && fencedAny[1]) {
    const inner = fencedAny[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

const responseSchema = z.object({
  explanation: z.string().default(""),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().default(""),
        action: z.enum(["create", "update", "delete"]),
      }),
    )
    .default([]),
});

export async function POST(request: NextRequest) {
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      await requireSession();
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const userMessage = buildUserMessage(
      parsed.prompt,
      parsed.files ?? [],
      parsed.language,
    );

    const result = await generate({
      system: SYSTEM_PROMPT,
      messages: [
        { id: crypto.randomUUID(), role: "user", content: userMessage },
      ],
      temperature: 0.2,
    });

    const jsonText = extractJsonBlock(result.content);
    if (!jsonText) {
      return NextResponse.json<GenerateResponse>({
        files: [],
        explanation: result.content,
      });
    }

    let data: z.infer<typeof responseSchema>;
    try {
      data = responseSchema.parse(JSON.parse(jsonText));
    } catch {
      return NextResponse.json<GenerateResponse>({
        files: [],
        explanation: result.content,
      });
    }

    return NextResponse.json<GenerateResponse>({
      files: data.files,
      explanation: data.explanation,
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
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status) || 500
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
