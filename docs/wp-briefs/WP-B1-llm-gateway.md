# WP-B1 — LLM Gateway (multi-provider, streaming, tool-calling, fallback)

**Self-contained brief.** Hand this to any AI coding tool.

## Context
SparkFlow monorepo at `~/sparkflow`. WP-A1 (bootstrap) complete. `packages/llm` currently has a minimal gateway with OpenAI + mock providers and a heuristic router. Your job is to replace it with a production-grade gateway powered by the **Vercel AI SDK**, supporting 4 providers, streaming, tool calls, and automatic fallback — without changing the public call sites in `apps/web` more than necessary.

## Goal
A single entry point — `generate({...})` and `generateStream({...})` — that abstracts OpenAI, Anthropic, Google, and Groq; handles cost tracking; falls back on 5xx / rate-limits; supports zod-validated structured output; and supports tool calling.

## Acceptance criteria
1. Same interface as today: `apps/web/app/api/chat/route.ts` compiles without import changes to `@sparkflow/llm`.
2. New API `generateStream({...})` returns a `ReadableStream` consumable by the AI SDK `toDataStreamResponse()` helper.
3. Tool-calling support: caller passes `tools: { [name]: { schema: zod, handler } }` and the gateway executes them.
4. Fallback chain: configurable via env `LLM_FALLBACK_ORDER=anthropic,openai,groq,google`. On 5xx or 429 from provider A, retry on B. Expose `cause` for debugging.
5. Cost tracking: each `GenerateResult.usage.costUsd` is populated from a real pricing table checked into `packages/llm/src/pricing.ts` (input + output prices per 1M tokens per model).
6. Structured output: `generateObject({schema, ...})` wraps `ai` SDK equivalent and returns parsed zod object.
7. All four provider paths have at least one passing test in `packages/llm/tests/` (Vitest). Tests mock fetch — no real network.
8. Root `pnpm typecheck` and `pnpm test` stay green.

## Tech choices
- `ai@^4` (Vercel AI SDK core)
- `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/groq`
- `vitest` for tests (add `vitest.config.ts` + workspace entry)
- Keep `zod` as schema lib

## Files to create / modify
- Modify `packages/llm/package.json` — add SDK deps, add `test` script.
- New: `packages/llm/src/providers/{openai,anthropic,google,groq}.ts` — thin adapters over AI SDK.
- New: `packages/llm/src/gateway.ts` — replace current impl with a real router + fallback.
- New: `packages/llm/src/pricing.ts` — model → $/1M tokens.
- New: `packages/llm/src/stream.ts` — `generateStream`.
- New: `packages/llm/src/structured.ts` — `generateObject`.
- New: `packages/llm/src/tools.ts` — tool execution helper.
- New: `packages/llm/tests/{gateway,openai,anthropic,fallback}.test.ts`.
- Update: `packages/llm/src/index.ts` — exports.
- Fix model name: default must be a real, current model (e.g. `gpt-4o-mini`, not `gpt-4.1-mini`).

## Provider defaults
| Provider | Env var | Default model |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-3-5-sonnet-latest` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.0-flash` |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |

## Do NOT
- Do not break the existing `generate` signature consumed by `apps/web/app/api/chat/route.ts`.
- Do not bake API keys into the source.
- Do not make tests hit real APIs.
- Do not introduce LangChain.

## Verification
```bash
cd ~/sparkflow
pnpm install
pnpm --filter @sparkflow/llm test
pnpm typecheck
# Manual smoke: with OPENAI_API_KEY set, run apps/web dev, POST /api/chat -> real answer.
git add -A && git commit -m "WP-B1: multi-provider LLM gateway with streaming, tools, fallback"
```

## Downstream hooks
After this lands, WP-B2 (LLM-based router) should be trivial: call `generateObject({schema: plannerDecisionSchema, ...})` with `ROUTER_PROMPT` already exported from `@sparkflow/llm`.
