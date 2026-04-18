# SparkFlow

Full-scale AI operating system — chat, search, research, agents, workflows, and automation.

Monorepo managed with **pnpm workspaces** + **Turbo**.

## Structure

```
apps/
  web/        # Next.js 15 primary web application
  admin/      # Internal admin panel (reserved)
packages/
  shared/     # Types, zod schemas, utilities
  llm/        # Multi-provider LLM gateway + router
  db/         # Drizzle ORM schema + client
  ui/         # Design system (shadcn-based)
  agents/     # Multi-agent framework
  tools/      # Tool registry
  rag/        # Web + file retrieval
  memory/     # 4-type memory system
  evals/      # Promptfoo configs + datasets
infra/
  inngest/    # Background jobs
```

## Requirements

- Node 20+ (see `.nvmrc`)
- pnpm 9+

## Commands

```bash
pnpm install        # install all workspace deps
pnpm dev            # run dev servers across workspaces
pnpm build          # production build
pnpm typecheck      # TS check all packages
pnpm lint           # ESLint all packages
pnpm test           # run tests
pnpm format         # prettier write
```

## Status

This repo is the execution surface for the master plan at
`~/.claude/plans/distributed-napping-moonbeam.md`.

Currently on **WP-A1** — monorepo bootstrap.
