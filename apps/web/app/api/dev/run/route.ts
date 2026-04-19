/**
 * POST /api/dev/run
 *
 * Executes a set of files in an E2B sandbox and streams back stdout/stderr.
 * If E2B_API_KEY is not set we return a stub response so the UI still works
 * in local/dev without a real sandbox.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@sparkflow/auth";

export const runtime = "nodejs";

const fileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const requestSchema = z.object({
  language: z.enum(["ts", "js", "python"]),
  files: z.array(fileSchema).min(1),
  entry: z.string().min(1),
});

type RunResponse = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
};

function runCommandFor(language: "ts" | "js" | "python", entry: string): string {
  const safe = entry.replace(/'/g, "'\\''");
  switch (language) {
    case "ts":
      // Prefer tsx if available, fall back to node --import=tsx.
      return `if command -v tsx >/dev/null 2>&1; then tsx '${safe}'; else node --experimental-strip-types '${safe}' 2>/dev/null || npx -y tsx '${safe}'; fi`;
    case "js":
      return `node '${safe}'`;
    case "python":
      return `python3 '${safe}'`;
  }
}

export async function POST(request: NextRequest) {
  const started = Date.now();
  try {
    const guestMode = request.headers.get("x-guest-mode") === "1";
    if (!guestMode) {
      await requireSession();
    }

    const body = await request.json();
    const parsed = requestSchema.parse(body);

    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      return NextResponse.json<RunResponse>({
        stdout: "",
        stderr: "Sandbox not configured. Set E2B_API_KEY.",
        exitCode: -1,
        durationMs: Date.now() - started,
      });
    }

    // Fully hidden dynamic import — webpack can't statically analyse a
    // Function()-built import expression, so the module is only resolved
    // at runtime if the SDK is actually installed.
    let SandboxCtor: unknown;
    try {
      const dynImport = new Function(
        "m",
        "return import(m)",
      ) as (m: string) => Promise<{ Sandbox?: unknown }>;
      const mod = await dynImport("@e2b/code-interpreter");
      SandboxCtor = mod.Sandbox;
    } catch {
      return NextResponse.json<RunResponse>({
        stdout: "",
        stderr:
          "E2B SDK not installed. Install `@e2b/code-interpreter` to enable sandboxed execution.",
        exitCode: -1,
        durationMs: Date.now() - started,
      });
    }

    if (!SandboxCtor || typeof (SandboxCtor as { create?: unknown }).create !== "function") {
      return NextResponse.json<RunResponse>({
        stdout: "",
        stderr: "E2B Sandbox interface unavailable.",
        exitCode: -1,
        durationMs: Date.now() - started,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbx = await (SandboxCtor as any).create({ apiKey });
    try {
      for (const f of parsed.files) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (sbx as any).files?.write === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sbx as any).files.write(f.path, f.content);
        }
      }

      const cmd = runCommandFor(parsed.language, parsed.entry);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exec = await (sbx as any).commands.run(cmd, { timeoutMs: 30_000 });

      const stdout: string =
        typeof exec?.stdout === "string"
          ? exec.stdout
          : Array.isArray(exec?.stdout)
            ? exec.stdout.join("")
            : "";
      const stderr: string =
        typeof exec?.stderr === "string"
          ? exec.stderr
          : Array.isArray(exec?.stderr)
            ? exec.stderr.join("")
            : "";
      const exitCode: number =
        typeof exec?.exitCode === "number" ? exec.exitCode : 0;

      return NextResponse.json<RunResponse>({
        stdout,
        stderr,
        exitCode,
        durationMs: Date.now() - started,
      });
    } finally {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sbx as any).kill?.();
      } catch {
        // ignore
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "invalid_request", issues: error.issues },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json<RunResponse>(
      {
        stdout: "",
        stderr: message,
        exitCode: -1,
        durationMs: Date.now() - started,
      },
      { status: 200 },
    );
  }
}
