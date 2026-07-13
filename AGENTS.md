# AGENTS.md — Canonical Operating Manual

Read this first. It is the single operating manual for agents and humans working in `agy-sandbox`. Other agent-facing files should point here or add only local deltas.

`agy-sandbox` has two layers:

- **Product:** `Starfall: Living Galaxy`, a persistent browser-native multiplayer space sim under `src/`.
- **Harness:** the autonomous-engineering control plane that plans, executes, verifies, logs, and replenishes work.

This file follows the [AGENTS.md](https://agents.md) open standard and is the one source every tool reads: `CLAUDE.md` imports it (`@AGENTS.md`), Cursor reads [`.cursor/rules/agents.mdc`](.cursor/rules/agents.mdc), and `.github/AGENT_RULES.md` adds only the GitHub-issue-flow delta. Human onboarding lives in [`README.md`](README.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md); the vulnerability-reporting policy is [`SECURITY.md`](SECURITY.md). Claude Code permission defaults (including substrate-edit denials) are committed in [`.claude/settings.json`](.claude/settings.json).

## 0. Substrate boundary

These files are write-protected substrate. Do not modify, rename, delete, or plan changes to them:

- `docs/AXIOMS.md`
- `docs/AGENT-LOOP.md`
- `scripts/assert-gate-integrity.ps1`
- `scripts/local-gate.ps1`
- `scripts/run-autonomous-loop.ps1`
- `scripts/validate-log-compliance.py`
- `scripts/manifest.txt`

The cross-platform verifier is `npm run agent:verify-substrate`. It reads `scripts/manifest.txt` and fails if any protected file hash changes. `manifest.txt` is the manifest itself (the source of truth for the hash set), so it holds the other six files' hashes and is not self-hashed — it stays protected by this list and review, not by the checksum.

## 1. Read-first order

1. `AGENTS.md` — this manual.
2. `docs/AXIOMS.md` — immutable constitution.
3. `docs/AGENT-LOOP.md` — compliance protocol.
4. `docs/GOAL.md` — product blueprint and architectural intent.
5. `plan/PROGRESS.md` — live work queue and resume anchor.
6. The selected `plan/specs/<id>_*.md` — atomic task contract.
7. `docs/ai/REPO_MAP.md` — where code and tests live.
8. Top entries of `docs/LOG.md` — recent history only.

The canonical queue is `plan/PROGRESS.md` + `plan/specs/`. Completed-wave history lives in `plan/archive/`.

## 2. Per-iteration loop

```text
1. STATUS   — inspect git/worktree state and latest progress/log entries.
2. ORIENT   — read the files above; confirm no substrate mutation is planned.
3. SELECT   — choose one unblocked spec or the smallest pillar slice that lands green.
4. CLAIM    — mark the spec in progress when operating in the plan queue.
5. CHANGE   — implement the smallest correct vertical slice; keep engine/net/persistence pure.
6. VERIFY   — targeted tests first, then `npm run agent:check` before claiming success.
7. RECORD   — update spec/progress, writable docs, and `docs/LOG.md` when required.
8. COMMIT   — only after the required gate is green and only under the active launch-context git rule.
9. SUMMARIZE — state changes, validation run, unvalidated areas, and next move.
```

If red or stuck, preserve the attempt, record the pivot, and recover to a known-good state. Do not hard-delete failed work without a trace.

## 3. Commands

Package manager: **npm**. Runtime policy: `.nvmrc` pins local dev to Node 24; `package.json` requires Node `>=22`; CI verifies Node 22/24/26.

| Intent | Command |
| --- | --- |
| Install | `npm run agent:bootstrap` |
| Substrate integrity | `npm run agent:verify-substrate` |
| Core gate | `npm run agent:check:core` |
| Full agent/commit gate | `npm run agent:check` |
| Build | `npm run build` (tsc → `dist/`) |
| Tests (Vitest) | `npm test` |
| Client tests | `npm run test:client` |
| Browser client tests | `npm run test:client:browser` |
| Lint | `npm run lint` |
| Typecheck | `npm run typecheck` |
| Format check | `npm run format:check` |
| Format write | `npm run format` |
| Run game | `npm run build` then `npm start` (`node dist/server.js`), then open `http://localhost:8080` |

`npm run agent:check` is the gate of record: it regenerates the codex map, then runs substrate integrity, the Prettier check, ESLint, typecheck (`tsc --noEmit`), the `tsc` build, and the full Vitest suite (node + jsdom + browser projects). `agent:check:core` runs the same checks without regenerating the codex map; use it only as an inner-loop shortcut, and do not call a task done from the core shortcut alone.

## 4. Coding rules

- Sources are TypeScript (`src/**/*.ts`), built by `tsc` to `dist/`. Server-side code is type-checked at `strict: false`; the browser client under `src/client/**` (and `src/main.ts`) is `// @ts-nocheck` for now — compiled for emit but not yet type-checked. Tightening types is tracked in `plan/BACKLOG.md`.
- Use **erasable TypeScript syntax only** — no `enum`, `namespace`, parameter properties, or decorators (`erasableSyntaxOnly` is enforced in `tsconfig.build.json`) — so the build strips types without transforming them and `dist/` stays a faithful strip of the source.
- Use ES modules only (`import`/`export`, no CommonJS).
- Keep `src/engine`, `src/physics`, `src/net`, and `src/persistence` pure: no DOM, sockets, timers, direct filesystem effects, or unseeded randomness in test-reachable paths.
- Seed or inject randomness; never let `Math.random` leak into deterministic assertions.
- Add or update tests for every behavior change.
- Prefer pure helpers plus thin server handlers over adding logic to `src/server.ts`.
- Use JSDoc on exported functions; prefix intentionally-unused variables/params with `_`.
- Do not add placeholders, TODO-only stubs, partial files, or debug leftovers.
- Use Conventional Commits.

## 5. Git workflow

The launch context controls the commit target:

- **Substrate local loop:** follows `docs/AGENT-LOOP.md`; commit only on a green full gate.
- **Local/overnight review branches:** work on the current feature branch and do not push or merge unless the launch context authorizes it.
- **GitHub issue flow:** create a branch and PR linking the issue.

Always forbidden unless explicitly authorized: force-push, history rewrite, `--no-verify`, destructive cleanup of non-generated files, committed secrets, or dependency/service additions requiring credentials.

## 6. Token-efficiency rules

- Start from `plan/PROGRESS.md` and `docs/ai/REPO_MAP.md`; do not blind-scan the repo.
- Skip `node_modules/`, `.git/`, `package-lock.json`, `coverage/`, `data/`, `night-queue/`, `.claude/`, and other generated/runtime folders.
- Read only the relevant `src/` module and its tests unless the spec requires broader context.
- `src/server.ts` is the main risky seam; read the relevant section, then extract to tested modules when possible.
- `docs/LOG.md` is newest-first; read only the top entries unless investigating history.
- Avoid new overlapping context docs. Prefer one canonical source plus thin pointers.

## 7. Definition of done

- [ ] Required gate was actually run and green: usually `npm run agent:check`.
- [ ] New/changed behavior has deterministic tests.
- [ ] No substrate file changed.
- [ ] Engine/net/persistence purity boundaries held.
- [ ] Spec/progress checkboxes and writable docs are reconciled.
- [ ] `docs/LOG.md` has a compliant entry iff required by its schema.
- [ ] Final handoff names validation run, unvalidated areas, and the next best move.
