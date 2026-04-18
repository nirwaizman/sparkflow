/**
 * Public surface for @sparkflow/evals.
 *
 * The package is primarily consumed via its CLI scripts (`pnpm -C
 * packages/evals eval`), but these exports allow other packages (e.g. a
 * future dashboard) to read the harness types directly.
 */

export type { EvalCase, EvalExpectation, EvalReport, EvalResult } from "./types";
export { runRouterEval } from "./router.eval";
export { runRagEval } from "./rag.eval";

export const EVALS_PACKAGE_VERSION = "0.1.0";
