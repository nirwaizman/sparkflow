# @sparkflow/evals

Deterministic evaluation harness for sparkflow subsystems (router, RAG, agents,
tools). Each suite is a `*.eval.ts` module under `src/` that writes a markdown
report to `reports/`.

## Running

```bash
# Run a single suite
pnpm -C packages/evals eval:router

# Run every *.eval.ts in src and write a consolidated report
pnpm -C packages/evals eval

# Run the vitest smoke tests (CI gate)
pnpm -C packages/evals test

# Typecheck
pnpm -C packages/evals typecheck
```

## Reports

Per-suite reports land in `packages/evals/reports/<suite>.md`. The
consolidated runner additionally writes `reports/summary.md`.

## Suites

| Suite | File | Status |
| --- | --- | --- |
| Router (heuristic + LLM) | `src/router.eval.ts` | Live — 25+ cases, HE + EN, 11 modes |
| RAG | `src/rag.eval.ts` | Scaffold — real golden set arrives with WP-B4/B5 |

## Adding a new suite

1. Create `src/<name>.eval.ts`.
2. Export an async function named `run<Name>Eval` returning an `EvalReport`
   (or an object whose values are `EvalReport`s — the runner unwraps both).
3. Write a markdown report to `packages/evals/reports/<name>.md` from inside
   the runner so the harness output stays self-contained.
4. Add a smoke test under `tests/` if you want the suite gated on CI.

## Baseline

The `router-eval.test.ts` test asserts **≥ 50%** heuristic pass rate. This is
deliberately generous — heuristic misses are expected on ambiguous Hebrew
phrasing. The LLM classifier (`classifyWithLlm`) is expected to land above
80% once WP-A6 calibration ships.

## Environment

The LLM leg of `router.eval.ts` only runs when at least one provider key is
present:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GROQ_API_KEY`

Without any key the runner still produces a heuristic report and logs that
the LLM leg was skipped.
