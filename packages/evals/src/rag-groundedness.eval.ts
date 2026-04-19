/**
 * RAG groundedness eval: builds a grounded prompt, asserts the LLM cites
 * the expected source indexes via inline [1]/[2]/... markers.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generate, buildGroundingBlock, SYSTEM_PROMPT } from "@sparkflow/llm";
import { extractCitations } from "@sparkflow/rag";
import type { SourceItem } from "@sparkflow/shared";
import type { EvalCase, EvalReport, EvalResult } from "./types";

type RagCase = EvalCase & {
  input: { sources: SourceItem[]; question: string };
  expected: { citedIndexes: number[] };
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(
  readFileSync(path.join(__dirname, "datasets/rag-groundedness.json"), "utf-8"),
) as RagCase[];

async function runCase(c: RagCase): Promise<EvalResult> {
  try {
    const grounding = buildGroundingBlock(c.input.sources);
    const res = await generate({
      system: `${SYSTEM_PROMPT}\n\nMode: research.${grounding}`,
      messages: [{ id: c.id, role: "user", content: c.input.question }],
      temperature: 0.1,
    });
    const cited = new Set<number>(extractCitations(res.content) as number[]);
    const expected = new Set<number>(c.expected.citedIndexes);
    // Pass if every expected index is cited; extra citations are OK.
    let match = 0;
    for (const i of expected) if (cited.has(i)) match += 1;
    const precision = cited.size === 0 ? 0 : [...cited].filter((i) => expected.has(i)).length / cited.size;
    const recall = expected.size === 0 ? 1 : match / expected.size;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    return {
      case: c,
      pass: recall === 1,
      score: f1,
      output: { content: res.content, cited: [...cited], expected: [...expected] },
    };
  } catch (err) {
    return { case: c, pass: false, score: 0, output: null, error: String(err) };
  }
}

export async function runRagGroundednessEval(): Promise<EvalReport> {
  const details: EvalResult[] = [];
  for (const c of dataset) details.push(await runCase(c));
  const passed = details.filter((d) => d.pass).length;
  return {
    suite: "rag-groundedness",
    total: dataset.length,
    passed,
    failed: dataset.length - passed,
    pass_rate: passed / dataset.length,
    details,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRagGroundednessEval().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.pass_rate >= 0.6 ? 0 : 1;
  });
}
