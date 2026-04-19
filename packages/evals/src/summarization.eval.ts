/**
 * Summarization eval: scores generated summaries vs ideal via word overlap
 * (BLEU-ish Jaccard) + LLM-as-judge. Combined score ≥ 0.5 passes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generate } from "@sparkflow/llm";
import type { EvalCase, EvalReport, EvalResult } from "./types";

type SumCase = EvalCase & {
  input: string;
  expected: { idealSummary: string; maxWords: number };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(
  readFileSync(path.join(__dirname, "datasets/summarization.json"), "utf-8"),
) as SumCase[];

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

async function judgeScore(
  candidate: string,
  ideal: string,
  input: string,
): Promise<number> {
  try {
    const res = await generate({
      system:
        "You are a strict summary judge. Score how well the CANDIDATE captures the INPUT relative to the IDEAL. Output a single number 0..1 with no prose.",
      messages: [
        {
          id: "judge",
          role: "user",
          content: `INPUT:\n${input}\n\nIDEAL:\n${ideal}\n\nCANDIDATE:\n${candidate}\n\nScore 0..1:`,
        },
      ],
      temperature: 0,
      maxTokens: 8,
    });
    const n = parseFloat(res.content.trim());
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
  } catch {
    return 0.5; // neutral if judge unavailable
  }
}

async function runCase(c: SumCase): Promise<EvalResult> {
  try {
    const res = await generate({
      system: `Summarize in <= ${c.expected.maxWords} words. Preserve the user's language. One sentence when possible.`,
      messages: [{ id: c.id, role: "user", content: c.input }],
      temperature: 0.2,
      maxTokens: 120,
    });
    const candidate = res.content.trim();
    const overlap = jaccard(tokens(candidate), tokens(c.expected.idealSummary));
    const judged = await judgeScore(candidate, c.expected.idealSummary, c.input);
    const score = 0.4 * overlap + 0.6 * judged;
    return {
      case: c,
      pass: score >= 0.5,
      score,
      output: { candidate, overlap, judged },
    };
  } catch (err) {
    return { case: c, pass: false, score: 0, output: null, error: String(err) };
  }
}

export async function runSummarizationEval(): Promise<EvalReport> {
  const details: EvalResult[] = [];
  for (const c of dataset) details.push(await runCase(c));
  const passed = details.filter((d) => d.pass).length;
  return {
    suite: "summarization",
    total: dataset.length,
    passed,
    failed: dataset.length - passed,
    pass_rate: passed / dataset.length,
    details,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSummarizationEval().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.pass_rate >= 0.5 ? 0 : 1;
  });
}
