/**
 * Router eval — compares the zero-cost `heuristicRoute` and (when keys are
 * configured) the LLM-backed `classifyWithLlm` against a hand-labelled dataset.
 *
 * Run with: `pnpm -C packages/evals eval:router`
 *
 * The runner writes a markdown report to `reports/router.md` with overall and
 * per-mode pass rates. This is the WP-G2 baseline — future WPs will add
 * confidence calibration and per-language buckets.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PlannerDecision, PlannerMode } from "@sparkflow/shared";
import { heuristicRoute, classifyWithLlm } from "@sparkflow/llm";

import type { EvalCase, EvalReport, EvalResult } from "./types";
import datasetJson from "./datasets/router.json" with { type: "json" };

const dataset = datasetJson as EvalCase[];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RouterFn = (input: string) => PlannerDecision | Promise<PlannerDecision>;

function runCase(c: EvalCase, decision: PlannerDecision): EvalResult {
  const failures: string[] = [];
  if (c.expected.mode && decision.mode !== c.expected.mode) {
    failures.push(`expected mode=${c.expected.mode}, got ${decision.mode}`);
  }
  if (c.expected.minConfidence !== undefined && decision.confidence < c.expected.minConfidence) {
    failures.push(`confidence ${decision.confidence} < ${c.expected.minConfidence}`);
  }
  const text = JSON.stringify(decision).toLowerCase();
  for (const token of c.expected.mustContain ?? []) {
    if (!text.includes(token.toLowerCase())) failures.push(`missing "${token}"`);
  }
  for (const token of c.expected.mustNotContain ?? []) {
    if (text.includes(token.toLowerCase())) failures.push(`unexpected "${token}"`);
  }
  return {
    case: c,
    pass: failures.length === 0,
    output: decision,
    error: failures.length ? failures.join("; ") : undefined,
    score: failures.length === 0 ? 1 : 0,
  };
}

async function runSuite(name: string, route: RouterFn): Promise<EvalReport> {
  const details: EvalResult[] = [];
  for (const c of dataset) {
    const start = performance.now();
    try {
      const decision = await route(c.input);
      const result = runCase(c, decision);
      result.latencyMs = Math.round(performance.now() - start);
      details.push(result);
    } catch (err) {
      details.push({
        case: c,
        pass: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Math.round(performance.now() - start),
      });
    }
  }

  const passed = details.filter((d) => d.pass).length;
  const total = details.length;
  const breakdown: NonNullable<EvalReport["breakdown"]> = {};
  for (const d of details) {
    const mode = d.case.expected.mode ?? "unknown";
    const b = breakdown[mode] ?? { passed: 0, total: 0, pass_rate: 0 };
    b.total += 1;
    if (d.pass) b.passed += 1;
    breakdown[mode] = b;
  }
  for (const key of Object.keys(breakdown)) {
    const b = breakdown[key]!;
    b.pass_rate = b.total === 0 ? 0 : b.passed / b.total;
  }
  return {
    suite: name,
    passed,
    failed: total - passed,
    total,
    pass_rate: total === 0 ? 0 : passed / total,
    details,
    breakdown,
    generatedAt: Date.now(),
  };
}

function formatReport(reports: EvalReport[]): string {
  const lines: string[] = [];
  lines.push(`# Router eval report`);
  lines.push("");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push(`_Dataset size: ${dataset.length}_`);
  lines.push("");

  for (const r of reports) {
    lines.push(`## ${r.suite}`);
    lines.push("");
    lines.push(`- Passed: **${r.passed} / ${r.total}** (${(r.pass_rate * 100).toFixed(1)}%)`);
    lines.push("");
    lines.push(`### Per-mode pass rate`);
    lines.push("");
    lines.push("| Mode | Passed | Total | Pass rate |");
    lines.push("| --- | ---: | ---: | ---: |");
    const modes = Object.keys(r.breakdown ?? {}).sort();
    for (const m of modes) {
      const b = r.breakdown![m]!;
      lines.push(`| ${m} | ${b.passed} | ${b.total} | ${(b.pass_rate * 100).toFixed(1)}% |`);
    }
    lines.push("");
    lines.push(`### Failures`);
    lines.push("");
    const failures = r.details.filter((d) => !d.pass);
    if (failures.length === 0) {
      lines.push("_None — all cases passed._");
    } else {
      lines.push("| Case | Input | Error |");
      lines.push("| --- | --- | --- |");
      for (const f of failures) {
        const input = f.case.input.replace(/\|/g, "\\|").slice(0, 80);
        lines.push(`| ${f.case.id} | ${input} | ${f.error ?? "-"} |`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function hasAnyProviderKey(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GROQ_API_KEY,
  );
}

export async function runRouterEval(): Promise<{ heuristic: EvalReport; llm?: EvalReport }> {
  const heuristic = await runSuite("heuristic", (input) => heuristicRoute(input));
  let llm: EvalReport | undefined;
  if (hasAnyProviderKey()) {
    llm = await runSuite("llm", (input) => classifyWithLlm(input));
  }

  const reports = llm ? [heuristic, llm] : [heuristic];
  const reportsDir = path.resolve(__dirname, "..", "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "router.md");
  await fs.writeFile(reportPath, formatReport(reports), "utf8");
  // Always log the final summary to stdout so CI logs are useful.
  // eslint-disable-next-line no-console
  console.log(
    `[router.eval] heuristic=${(heuristic.pass_rate * 100).toFixed(1)}%` +
      (llm ? ` llm=${(llm.pass_rate * 100).toFixed(1)}%` : " (llm skipped — no provider keys)") +
      ` -> ${reportPath}`,
  );

  return { heuristic, llm };
}

// Map imported mode names from JSON (string) to PlannerMode lazily — purely
// cosmetic for IDE autocompletion; the JSON is already typed as EvalCase[].
export type { PlannerMode };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  runRouterEval().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
