/**
 * Consolidated eval runner.
 *
 * Discovers and runs every `*.eval.ts` module in `src/`, prints a consolidated
 * summary to stdout, and writes a top-level `reports/summary.md` aggregating
 * each suite's pass rate. Individual runners are responsible for writing
 * their own per-suite markdown report.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { EvalReport } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SuiteModule = {
  // Each runner may either export a named `run*Eval` function or provide a
  // default export. We accept any async function that returns an EvalReport
  // or a record of reports.
  [key: string]: unknown;
};

async function discoverSuites(): Promise<string[]> {
  const entries = await fs.readdir(__dirname, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".eval.ts"))
    .map((e) => path.join(__dirname, e.name));
}

async function runSuiteFile(file: string): Promise<EvalReport[]> {
  const mod = (await import(pathToFileURL(file).href)) as SuiteModule;
  const reports: EvalReport[] = [];
  for (const [key, val] of Object.entries(mod)) {
    if (typeof val !== "function") continue;
    if (!/^run.*Eval$/.test(key)) continue;
    try {
      const out = await (val as () => Promise<unknown>)();
      if (!out) continue;
      if (Array.isArray(out)) {
        reports.push(...(out as EvalReport[]));
      } else if (typeof out === "object") {
        const record = out as Record<string, EvalReport | undefined>;
        // handle `{ heuristic, llm? }` shapes
        const maybeReports = Object.values(record).filter(
          (r): r is EvalReport => Boolean(r && typeof r === "object" && "suite" in (r as object)),
        );
        if (maybeReports.length > 0) {
          reports.push(...maybeReports);
        } else if ("suite" in (out as object)) {
          reports.push(out as EvalReport);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[evals] suite ${key} in ${path.basename(file)} failed:`, err);
    }
  }
  return reports;
}

async function main(): Promise<void> {
  const files = await discoverSuites();
  const reports: EvalReport[] = [];
  for (const file of files) {
    const suiteReports = await runSuiteFile(file);
    reports.push(...suiteReports);
  }

  // eslint-disable-next-line no-console
  console.log("\n=== Eval summary ===");
  for (const r of reports) {
    // eslint-disable-next-line no-console
    console.log(
      `- ${r.suite.padEnd(16)} ${r.passed}/${r.total}  pass_rate=${(r.pass_rate * 100).toFixed(1)}%`,
    );
  }

  const reportsDir = path.resolve(__dirname, "..", "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const summaryPath = path.join(reportsDir, "summary.md");
  const lines = [
    "# Eval summary",
    "",
    `_Generated: ${new Date().toISOString()}_`,
    "",
    "| Suite | Passed | Total | Pass rate |",
    "| --- | ---: | ---: | ---: |",
    ...reports.map(
      (r) => `| ${r.suite} | ${r.passed} | ${r.total} | ${(r.pass_rate * 100).toFixed(1)}% |`,
    ),
    "",
  ];
  await fs.writeFile(summaryPath, lines.join("\n"), "utf8");

  const hasFailure = reports.some((r) => r.total > 0 && r.pass_rate < 0.5);
  if (hasFailure) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
