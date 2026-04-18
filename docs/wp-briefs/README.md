# Work-Package Briefs

Each brief in this folder is **self-contained** and can be handed to any AI coding tool (Claude Code / Cursor / Codex / Windsurf) as the full context for that module.

## Playbook

1. Open a fresh session of the target tool at `~/sparkflow`.
2. Paste the relevant brief as the first message.
3. Let the tool implement + commit on a feature branch (`wp-X-name`).
4. Merge to `main` after typecheck + tests green.
5. Mark the WP done in `~/.claude/plans/distributed-napping-moonbeam.md`.

## Status

| WP | File | Status | Depends on |
|---|---|---|---|
| A1 | (this repo is the result) | DONE | — |
| A2 | `WP-A2-database.md` | READY | A1 |
| A3 | not written yet | PENDING | A2 |
| A4 | not written yet | PENDING | A1 |
| A5 | not written yet | PENDING | A2, A4 |
| B1 | `WP-B1-llm-gateway.md` | READY | A1 |
| B2 | not written yet | PENDING | B1 |
| B3 | not written yet | PENDING | A2, B1 |
| B4 | not written yet | PENDING | A2, B1 |
| B5 | not written yet | PENDING | B1 |
| C1 | not written yet | PENDING | B1 |
| C2 | not written yet | PENDING | C1 |
| C3 | not written yet | PENDING | B1, C1 |
| C4 | not written yet | PENDING | A2, C3 |
| C5 | not written yet | PENDING | C3 |
| D1 | not written yet | PENDING | A1 |
| D2 | not written yet | PENDING | D1, B1 |
| ... | ... | ... | ... |

## Parallel track recommendation

A2 (Database) and B1 (LLM gateway) have **no overlap** — run them in parallel in two separate AI tool sessions now.
