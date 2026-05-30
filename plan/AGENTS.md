# /plan/AGENTS.md — Execution Rules for the Blueprint

Runtime rules for any agent executing the [`specs/`](specs/). **The canonical project manual is the
repo-root [`../AGENTS.md`](../AGENTS.md)** — read it first; this file only adds the plan-execution
protocol and does not override the substrate boundary, conventions, or git workflow defined there.

## Environment verification (run from repo root)

| Step | Command | Pass condition |
| --- | --- | --- |
| Install | `npm ci` | clean install from lockfile |
| **Full gate (= CI)** | `npm run agent:check` | prettier --check + eslint + jest all green |
| Tests only | `npm test` | all suites pass |
| One suite | `npm test -- src/engine/<X>.test.js` | targeted pass |
| Lint | `npm run lint` | eslint exits 0 |
| Format (write) | `npm run format` | — |
| Type-check | `scripts/agent/typecheck.{sh,ps1}` | skipped (plain JS — no tsconfig) |
| **Build** | _none_ | project has no build step (static + node) |
| Server smoke | `PORT=18190 NODE_ENV=test node src/server.js` | prints "LISTENING", no crash (Ctrl-C) |
| Security | `npm audit` | track high/critical; see `specs/001` |
| LOG compliance | `python scripts/validate-log-compliance.py` | PASS before committing a LOG entry |

Baseline to preserve or improve (v2 · 2026-05-29, after Phase 0+1): **614 tests / 42 suites green;
ESLint 10 + Jest 30 + Prettier clean; `npm audit` 0 vulnerabilities.** Toolchain is current
(`ws` 8.21, ESLint 10, Jest 30, `@google/genai`); runtime `dependencies` is just `ws`.

> **Ledger safety (learned the hard way, iter-0037):** a rogue writer once clobbered the entire
> `docs/LOG.md` history by matching the `== LOG-ANCHOR ==` *substring in the Rules text*. Always prepend
> below the **standalone** `== LOG-ANCHOR ==` line (around line 42), never the first match, and serialize
> ledger edits — do not run parallel writers against the same tree.

## Per-spec execution loop

1. **Select** the lowest-numbered `[ ] Todo` spec in `PROGRESS.md` whose "Blocked by" is satisfied.
2. **Claim** it: set its `PROGRESS.md` line to `[~] In Progress`.
3. **Read** the spec file fully (Description, DoD/Acceptance, Implementation Approach, Test Strategy).
4. **Implement** the smallest correct slice. Keep `src/engine|physics|net|persistence` **pure** (no DOM,
   sockets, timers, or `Math.random` in test-reachable paths; seed/inject randomness).
5. **Test** every behavior with deterministic Jest specs beside the source; verify server-touching work
   by booting the server.
6. **Gate:** `npm run agent:check` MUST be green. Never weaken or bypass it.
7. **Record:** tick the spec's acceptance boxes, set `PROGRESS.md` to `[x] Done`, and prepend a compliant
   entry to `../docs/LOG.md` (newest-first below `== LOG-ANCHOR ==`; validate with the python script).
8. **Commit** on green using Conventional Commits (`feat/fix/test/docs/chore`). **No push/merge** unless
   the launch context explicitly authorizes it. File follow-up specs for anything discovered.
9. **Repeat.**

## Guardrails (hard)

- **Never modify the substrate** (root `AGENTS.md` §0 / `docs/AGENT-LOOP.md`): `docs/AXIOMS.md`,
  `docs/AGENT-LOOP.md`, `scripts/{assert-gate-integrity,local-gate,run-autonomous-loop}.ps1`,
  `scripts/validate-log-compliance.py`, `scripts/manifest.txt`.
- **No placeholders/TODOs/partial files.** Every file written is complete and production-ready.
- **Determinism in tests.** No `Math.random` in assertions.
- **Security specs first.** Do not start Phase 1 until Phase 0 (`001`–`006`) is green, unless a Phase 0
  spec is genuinely blocked (document why in `PROGRESS.md`).
- **Honesty.** Never claim a check passed unless it actually ran and passed; record absent gates as "not found".
- **Stop and (when headless) take the safest documented assumption** for: substrate edits (never),
  pushes/merges/PRs (only if authorized), destructive/data-loss ops, new paid services/credentials, or
  real legal/security ambiguity.

## Notes for downstream agents
- The engine is the safe place to add logic; `server.js` is the risky seam (untested) — prefer extracting
  pure units (`specs/007`) over editing it in place.
- Reuse existing patterns: `createSeededRng` (GenerativeMissions) for RNG; frozen `DEFAULT_*_OPTIONS`
  option objects; pure modules + a thin server handler; `*.test.js` beside source.
