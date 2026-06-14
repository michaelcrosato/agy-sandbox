# agy-sandbox

An empty product repository seeded with the AI operations engine. **There is currently no application code here.**

> **Honest status (2026-06-14):** This repo has no `src/`, no tests, and no runnable product. It contains the autonomous-engineering harness (specs → build → verify → judge → ship) and config only. A prior product — *Starfall: Living Galaxy*, a browser-native multiplayer space sim — used to live here but was **deliberately purged on 2026-06-09**. The full prior codebase is preserved in git history at tag `pre-purge-20260609` and on the remote. See [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md) for the full assessment.

---

## What this does (today)

Nothing yet, as a product. The repo is a clean sandbox waiting for a product decision:

- **Restore** the purged Starfall codebase (`git reset --hard pre-purge-20260609`), or
- **Start a new product** under this engine, or
- **Stay a template/sandbox** for harness experiments.

This decision is unresolved. It is the top item in [`roadmap/ROADMAP.md`](roadmap/ROADMAP.md) and must be recorded in `roadmap/DECISIONS.md` before meaningful feature work begins.

## What used to be here (the intended product)

`GOAL.md` describes the purged vision: **Starfall: Living Galaxy** — a persistent, browser-native multiplayer space sim where "the galaxy is alive without you." An authoritative Node/WebSocket server simulated a persistent galaxy (markets, factions, NPCs, missions, reputation, a server-side "heartbeat" that advanced the world while no one was connected); a Canvas client let players fly, fight, trade, dock, and take missions. At tag `pre-purge-20260609` this was a real ~274-file codebase with co-located tests. **None of it is in the current tree.** Treat `GOAL.md` as an archived vision document, not a description of what exists.

## Architecture

- **Current tree:** no product architecture. Only the operations engine (`.claude/`, `scripts/`, engine docs) and empty state scaffolding (`roadmap/`).
- **Intended (archived) architecture, from `GOAL.md`:** authoritative server (`src/server.js`) as a thin composition root; pure, deterministic, seeded simulation modules (`src/engine`, `src/physics`, `src/net`, `src/persistence`) with no DOM/socket/timer/filesystem dependencies; a Canvas browser client (`src/client`); a swappable persistence store. This is aspirational relative to the current tree.

## Tech stack

- **Language/tooling present:** TypeScript (`tsc --noEmit` typecheck), [Biome](https://biomejs.dev/) lint, Node (`@types/node` 25), `ts-node`. See `package.json` / `tsconfig.json` / `biome.json`.
- These tools currently target the **engine scripts** (`scripts/*.ts`), not a product.

## Run / dev commands

There is **no app to run** and **no product test suite**. The only real commands are the ones actually defined in `package.json`:

```bash
npm run verify          # bash scripts/verify.sh — the engine gate (typecheck + lint + state + shield)
npm run typecheck       # tsc --noEmit
npm run lint            # biome lint scripts
npm run state           # ts-node scripts/update-state.ts (backlog mutations)
npm run state:validate  # ts-node scripts/update-state.ts --validate (state-vs-reality drift check)
npm run shield          # ts-node scripts/assertion-shield.ts (test-assertion tamper guard)
```

> Ignore the run/validation instructions in older copies of this file — `node src/server.js`, `npm run agent:check`, `npm test`, `npm run test:client`, etc. referenced files and scripts that **do not exist**. They have been removed.

## Current status (what works / what doesn't)

| Area | Status |
|---|---|
| Product application code | **Does not exist** (no `src/`, no `lib/`) |
| Product tests | **Do not exist** (no `test` script, no Jest/Vitest config) |
| Runnable server / client | **No** |
| Backlog (`roadmap/features.json`) | **Empty** (`[]`) |
| State files (`STATUS.md`, `metrics.jsonl`) | Empty stubs; `PROGRESS.md` top entry is stale carryover |
| Ops engine + config (`.claude/`, `scripts/`, `package.json`) | Present and coherent (not the review target) |
| Engine gate (`scripts/verify.sh`) | Targets scripts, not a product |

## Pointers

- **Full engineering assessment:** [`docs/ENGINEERING_REVIEW.md`](docs/ENGINEERING_REVIEW.md)
- **Roadmap / priorities:** [`roadmap/ROADMAP.md`](roadmap/ROADMAP.md)
- **Archived product vision:** [`GOAL.md`](GOAL.md)
- **How the operations engine works:** `AI_OPERATIONS_PLAN.md`, `OPERATOR_GUIDE.md`, `CLAUDE.md` (not the product)
- **Optional engine modules (activate when product code lands):** [`docs/optional-modules.md`](docs/optional-modules.md)
