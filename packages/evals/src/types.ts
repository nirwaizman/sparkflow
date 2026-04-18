/**
 * Shared types for the @sparkflow/evals harness.
 *
 * An `EvalCase` is a single input + expectations. An `EvalResult` is what the
 * runner produces after executing a case against a system-under-test. An
 * `EvalReport` aggregates results for a whole suite and is what individual
 * runners write to `reports/*.md`.
 */

import type { PlannerMode } from "@sparkflow/shared";

export type EvalExpectation = {
  mode?: PlannerMode;
  mustContain?: string[];
  mustNotContain?: string[];
  minConfidence?: number;
};

export type EvalCase = {
  id: string;
  input: string;
  expected: EvalExpectation;
  // Optional grouping labels used for per-tag pass rates in the report.
  tags?: string[];
};

export type EvalResult = {
  case: EvalCase;
  pass: boolean;
  score?: number;
  error?: string;
  output: unknown;
  latencyMs?: number;
};

export type EvalReport = {
  suite: string;
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
  details: EvalResult[];
  // Optional per-bucket breakdown. Populated by suites that group cases.
  breakdown?: Record<string, { passed: number; total: number; pass_rate: number }>;
  // Unix ms for ordering when merging reports.
  generatedAt?: number;
};
