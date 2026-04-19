import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Produce a line-level Markdown diff between two files. Uses a simple LCS
 * diff so it has no runtime deps.
 */
const parameters = z.object({
  fileIdA: z.string().min(1).describe("First file id (the 'before')"),
  fileIdB: z.string().min(1).describe("Second file id (the 'after')"),
  maxLines: z
    .number()
    .int()
    .positive()
    .max(10_000)
    .optional()
    .describe("Max lines per file to diff (default 2000)"),
});

type Params = z.infer<typeof parameters>;

export type CompareFilesResult = {
  fileIdA: string;
  fileIdB: string;
  diff: string;
  additions: number;
  deletions: number;
  error?: string;
};

function baseUrl(): string {
  return (
    process.env.SPARKFLOW_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

/** Minimal LCS-based line diff. Returns unified-style hunks. */
function lineDiff(a: string[], b: string[]): {
  text: string;
  additions: number;
  deletions: number;
} {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) row[j] = next[j + 1]! + 1;
      else row[j] = Math.max(next[j]!, row[j + 1]!);
    }
  }
  const out: string[] = [];
  let adds = 0;
  let dels = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push(`- ${a[i]}`);
      dels++;
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      adds++;
      j++;
    }
  }
  while (i < n) {
    out.push(`- ${a[i++]}`);
    dels++;
  }
  while (j < m) {
    out.push(`+ ${b[j++]}`);
    adds++;
  }
  return { text: out.join("\n"), additions: adds, deletions: dels };
}

async function fetchFileText(fileId: string): Promise<string> {
  const res = await fetch(
    `${baseUrl()}/api/files/${encodeURIComponent(fileId)}/text`,
  );
  if (!res.ok) throw new Error(`files/text returned ${res.status} for ${fileId}`);
  return res.text();
}

export const compareFilesTool: ToolRegistration<Params, CompareFilesResult> = {
  tool: {
    name: "compare_files",
    description:
      "Produce a Markdown line-level diff of two stored files. Counts additions and deletions.",
    parameters,
    handler: async ({ fileIdA, fileIdB, maxLines }) => {
      const limit = maxLines ?? 2000;
      try {
        const [ta, tb] = await Promise.all([
          fetchFileText(fileIdA),
          fetchFileText(fileIdB),
        ]);
        const a = ta.split(/\r?\n/).slice(0, limit);
        const b = tb.split(/\r?\n/).slice(0, limit);
        const { text, additions, deletions } = lineDiff(a, b);
        return {
          fileIdA,
          fileIdB,
          diff: "```diff\n" + text + "\n```",
          additions,
          deletions,
        };
      } catch (err) {
        return {
          fileIdA,
          fileIdB,
          diff: "",
          additions: 0,
          deletions: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "files",
  safety: {
    requiresAuth: true,
    maxInvocationsPerRequest: 6,
    allowInAutonomousMode: true,
  },
};
