# AGENTS.md — Canonical Operating Manual for Coding Agents

**Read this first.** It is the single entry point for any agent (Claude Code, Cursor, GitHub
Actions, or a human) working in `agy-sandbox`. It ties together the existing control-plane docs
and the day-to-day workflow. It does **not** replace them — where it points at a substrate doc,
that doc wins.

> `agy-sandbox` is two layers: a **product** (`Starfall: Living Galaxy`, a multiplayer space sim,
> all under `src/`) and an **autonomous-engineering harness** (the `docs/` + `scripts/` substrate
> that loops a headless model over the product). You improve the product; you obey the harness.

---

## 0. Substrate boundary (READ FIRST, never cross)

These control-plane files are **write-protected**. Never modify, edit, plan changes to, rename, or
delete them — they are verified by `scripts/assert-gate-integrity.ps1` against `scripts/manifest.txt`:

- `docs/AXIOMS.md`
- `docs/AGENT-LOOP.md`
- `scripts/assert-gate-integrity.ps1`
- `scripts/local-gate.ps1`
- `scripts/run-autonomous-loop.ps1`
- `scripts/validate-log-compliance.py`
- `scripts/manifest.txt`

Everything else is yours to evolve, including `docs/GOAL.md` (the product blueprint) and
`docs/LOG.md` (the append-only ledger). See `docs/AGENT-LOOP.md` for the authoritative statement.

---

## 1. Read-first order

1. **`AGENTS.md`** (this file) — how to work here.
2. **`docs/AXIOMS.md`** — the constitution (substrate, read-only). Ground every decision in it.
3. **`docs/AGENT-LOOP.md`** — the compliance protocol & iteration checklist (substrate, read-only).
4. **`docs/GOAL.md`** — the product blueprint: North Star, invariants, pillars **P1–P8**, and "how
   to pick the next move." This is your high-level intent. **Real repo state outranks it**; when
   they conflict, fix the code and amend the relevant section of `docs/GOAL.md`.
5. **`ROADMAP.md`** — engineering phases and the prioritized ticket map.
6. **`docs/ai/REPO_MAP.md`** — where everything lives and what to skip.
7. **`tickets/`** — atomic, executable units of work. Pick the top unblocked one.
8. **`docs/LOG.md`** — recent history (newest first); see what the last iterations did and intended.
9. **`.github/AGENT_RULES.md`** — coding standards & the git workflow (Phase 1–4).

---

## 2. The workflow loop (run this every iteration, unprompted)

```
1. STATUS    — scripts/agent/status.{sh,ps1}; read git + working-tree state.
2. ORIENT    — re-read docs/AXIOMS.md, then docs/GOAL.md + ROADMAP.md + REPO_MAP + the top ticket.
               Confirm zero substrate mutations are planned.
3. SELECT    — pick ONE unblocked, small ticket (or the lowest-numbered pillar with unblocked work).
               Prefer the smallest vertical slice that lands green and visibly advances the North Star.
4. CLAIM     — mark the ticket in-progress.
5. CHANGE    — implement the slice. Keep the engine pure (no DOM/sockets/Math.random in src/engine,
               src/physics, src/net). Add deterministic tests for every behavior you add or fix.
6. VERIFY    — targeted first (scripts/agent/test.sh <file>), then the broad gate: npm run agent:check
               (= prettier --check + eslint + jest, mirroring CI exactly).
7. RECORD    — update the ticket's checkboxes, update docs/GOAL.md or ROADMAP if intent shifted,
               and append a compressed entry to docs/LOG.md per its schema (newest-first, below the
               == LOG-ANCHOR ==). File follow-up tickets for anything you discovered but didn't do.
8. COMMIT    — only on a fully green gate, per the git workflow in .github/AGENT_RULES.md §Phase 4.
9. SUMMARIZE — state what changed, gate result, and the single best next move.
```

This operationalizes the checklist in `docs/AGENT-LOOP.md`. If red or stuck: archive the attempt,
roll back to the last green baseline, log the pivot, and pick a different slice (see the Axioms).

---

## 3. Command reference

Package manager is **npm** (`package-lock.json` is committed; Node 20+).

| Intent | Portable (npm, any OS) | Windows (pwsh) | POSIX (bash) |
| --- | --- | --- | --- |
| Install deps | `npm run agent:bootstrap` (`npm ci`) | `scripts/agent/bootstrap.ps1` | `scripts/agent/bootstrap.sh` |
| Env diagnostics | — | `scripts/agent/doctor.ps1` | `scripts/agent/doctor.sh` |
| **Full gate (= CI)** | **`npm run agent:check`** | `scripts/agent/check.ps1` | `scripts/agent/check.sh` |
| Tests | `npm test` | `scripts/agent/test.ps1` | `scripts/agent/test.sh` |
| One test file | `npm test -- src/engine/Ship.test.js` | `scripts/agent/test.ps1 <file>` | `scripts/agent/test.sh <file>` |
| Lint | `npm run lint` | `scripts/agent/lint.ps1` | `scripts/agent/lint.sh` |
| Format (write) | `npm run format` | `scripts/agent/format.ps1` | `scripts/agent/format.sh` |
| Format (check) | `npm run format:check` | — | — |
| Type-check | — (plain JS) | `scripts/agent/typecheck.ps1` | `scripts/agent/typecheck.sh` |
| Repo status | — | `scripts/agent/status.ps1` | `scripts/agent/status.sh` |
| Run the game | `node src/server.js` then open http://localhost:8080 | | |

> **Always gate with `npm run agent:check` before committing.** The substrate `scripts/local-gate.ps1`
> only checks for a clean tree / conflict markers — it does **not** run prettier/lint/test. CI
> (`.github/workflows/ci.yml`) runs all three, so `agent:check` is what keeps `main` green. (This
> file set drifted out of Prettier compliance once precisely because the local gate skipped the
> format check — don't let it happen again.)

---

## 4. Conventions

- **ES Modules** (`import`/`export`, `"type": "module"`). No CommonJS `require`.
- **Pure, headless engine.** `src/engine`, `src/physics`, `src/net`, `src/persistence` must not touch
  the DOM, sockets, timers, or `Math.random` in test-reachable paths. The **server** orchestrates;
  the **client** renders; the **engine** simulates. Randomness is seeded or injected.
- **Tests are mandatory and deterministic.** Every feature/fix ships Jest tests next to the source
  (`*.test.js`). No `Math.random` in assertions; seed it (see `createSeededRng` in `GenerativeMissions.js`).
- **No placeholders / TODOs / partial files.** Every file you write is a complete, production-ready
  drop-in. (`docs/AGENT_RULES.md` forbids stubs.)
- **JSDoc** params/returns on exported functions. Lint is `eslint` flat config; `no-unused-vars` is a
  warning (prefix intentionally-unused params with `_`).
- **Conventional Commits**: `feat(scope): …`, `fix(scope): …`, `test: …`, `docs: …`.
- **Determinism & additivity win.** Prefer a backward-compatible slice (new optional params, `??`
  defaults) over a breaking rewrite — see the P6/P3 LOG entries for the house style.

---

## 5. Autonomous vs. ask

**Proceed autonomously** (default — this is a zero-human-in-the-loop sandbox):
- Implementing tickets / pillar slices, fixing bugs, adding tests, refactoring within `src/`.
- Editing writable docs (`docs/GOAL.md`, `docs/LOG.md`, `ROADMAP.md`, `tickets/`, `README.md`, this file).
- Anything reversible and local that keeps the gate green.

**Stop and ask a human** (or, when truly headless, take the safest reversible assumption, document it
in `docs/LOG.md`, and continue):
- Any change that would touch a **substrate** file (§0) — never do it.
- **Pushing, merging, force-pushing, or opening PRs** unless your launch context explicitly authorizes
  it (see the git workflow override in `.github/AGENT_RULES.md §Phase 4`). The local/overnight default
  is **no push, no merge** — work stays on the feature branch for human review.
- Destructive or irreversible ops: `git reset --hard`, history rewrites, deleting non-generated files,
  dropping data, removing dependencies.
- Adding a new runtime dependency, paid service, or anything needing secrets/credentials.
- Real legal/security ambiguity.

---

## 6. Token-efficiency notes

- **Map, don't blind-scan.** Start from `docs/ai/REPO_MAP.md`. Use `git ls-files` (excludes
  `node_modules/`) over recursive globs. Honor `.aiignore`.
- **Skip the noise:** `node_modules/`, `.git/`, `package-lock.json`, `coverage/`, `data/`,
  `night-queue/`. Don't read them into context.
- `src/server.js` is large (~1900 lines) and **not** unit-tested — read the section you need (it's
  organized by lettered section headers), don't ingest the whole file unless you must.
- `docs/LOG.md` is newest-first; read the top few entries for current context, not the whole ledger.
- The engine modules are small and pure — prefer reading one module + its `*.test.js` together.

---

## 7. Definition of done (per iteration)

- [ ] `npm run agent:check` is **green** (prettier + eslint + jest), or any red is explained and ticketed.
- [ ] New/changed behavior has deterministic tests.
- [ ] No substrate file touched; engine stayed pure.
- [ ] The ticket's acceptance checkboxes are updated; follow-ups filed.
- [ ] `docs/LOG.md` has a compliant entry **iff** product code / gate status / architecture changed.
- [ ] You never claimed a check passed that you did not actually run.
