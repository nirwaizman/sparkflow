/**
 * RAG eval — scaffold.
 *
 * TODO(WP-B4/B5): load the RAG golden set (questions + expected
 * context-chunk IDs + reference answers), run the `@sparkflow/rag` retriever,
 * score with:
 *   - retrieval  : hit@k, MRR@k, nDCG@k over expected chunk IDs
 *   - groundedness: reference-free claim verification against retrieved chunks
 *   - answer    : LLM-as-judge against the reference answer
 *
 * This file intentionally emits a trivial passing report today so the shared
 * `run.ts` harness has something to aggregate.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { EvalReport } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runRagEval(): Promise<EvalReport> {
  const report: EvalReport = {
    suite: "rag",
    passed: 0,
    failed: 0,
    total: 0,
    pass_rate: 0,
    details: [],
    generatedAt: Date.now(),
  };

  const reportsDir = path.resolve(__dirname, "..", "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "rag.md");
  const body = [
    "# RAG eval report",
    "",
    `_Generated: ${new Date().toISOString()}_`,
    "",
    "> This suite is a scaffold. The real implementation lands with WP-B4/B5.",
    "",
    "## TODO",
    "",
    "- [ ] Assemble golden set (≥ 50 Q/A pairs, Hebrew + English)",
    "- [ ] Wire `@sparkflow/rag` retriever into the runner",
    "- [ ] Implement hit@k / MRR / nDCG over expected chunk IDs",
    "- [ ] Add LLM-as-judge groundedness scoring",
    "- [ ] Fail the CI gate when pass_rate drops below the committed baseline",
    "",
  ].join("\n");
  await fs.writeFile(reportPath, body, "utf8");

  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  runRagEval().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
