# Engineering Review — agy-sandbox

**Reviewer:** Senior engineering review (adversarial, evidence-based)
**Date:** 2026-06-14
**Branch reviewed:** `chore/template-reset-20260614` (HEAD `8fba0d2`)
**Default branch:** `develop` (`55f7b38`)

---

## Verdict

**Grade: F (as a product). N/A (as a product) — it is an empty harness.**

There is no product here. The working tree contains **zero lines of application code** — no `src/`, no `lib/`, no `tests/`, no game, no server, no client. Every TypeScript/JS file in the tree (`scripts/*.ts`, `.claude/hooks/path-guard.js`) belongs to the freshly-installed AI operations engine, which is explicitly out of scope for this review. The "product" advertised everywhere — *Starfall: Living Galaxy*, a persistent multiplayer space sim — was a real, substantial codebase (274 JS/TS files with co-located tests at tag `pre-purge-20260609`) that was **deliberately deleted** on 2026-06-09 (commit `61a9aef`, "purge: reset to vision docs"). What remains is a contradiction: a `README.md` and `GOAL.md` that describe, in loving detail, a fully-featured game and its `src/server.js`, `plan/specs/`, and `docs/AXIOMS.md` — none of which exist on disk. The backlog (`roadmap/features.json`) is literally `[]`. This is not a half-built product; it is a construction site that has been bulldozed back to a billboard advertising the building that used to be there. Grade as a *product*: F. The honest framing is that this is a **clean, empty scaffold awaiting a product decision**, and the most damning engineering fact is that the documentation actively lies about what exists.

---

## What this actually is

A near-empty repository freshly seeded with the **ai-operations-template** drop-in engine. Concretely, the tracked tree (52 files) breaks down as:

- **Ops engine / harness** (out of scope to critique, but it is ~all of the repo): `.claude/` (agents, hooks, rules, skills, settings), `scripts/*.ts` + `scripts/*.sh` + `scripts/*.ps1`, `AI_OPERATIONS_PLAN.md`, `OPERATOR_GUIDE.md`, `AGENTS.md`, `CLAUDE.md`, `.github/` workflows and templates.
- **State scaffolding** (empty stubs): `roadmap/features.json` → `{"features": []}`, `roadmap/QUESTIONS.md` (header only), `roadmap/DECISIONS.md` (header only), `roadmap/STATUS.md` ("Not yet generated"), `roadmap/metrics.jsonl` (0 bytes), `roadmap/evidence/.gitkeep`.
- **Stale vision docs pointing at a deleted product**: `README.md`, `GOAL.md`.
- **One real doc**: `docs/optional-modules.md` (engine doc; describes what gets switched on "when product code lands").

File-type census of the tracked tree: 33 `.md`, 11 `.sh`, 9 `.json`, 5 `.yml`, 4 `.ts`, 2 `.ps1`, 1 each of `.jsonl/.js/.gitkeep/.gitignore/.gitattributes/.gitattributes`. **Product source files: 0.**

### The two ghosts in the history

The git history reveals this repo has worn two different product identities, both now gone:

1. **Pre-purge (tag `pre-purge-20260609`, commit `6ec9316`):** A real codebase of **274 `.js`/`.ts` files**. `git ls-tree -r 6ec9316 -- src` shows `src/engine/EconomyManager.js`, `GalaxyHeartbeat.js`, `FactionRegistry.js`, `FactionWarCampaign.js`, `CosmicStorm.js`, `src/client/CanvasRenderer.js`, `SpaceportUI.js`, etc., each with a co-located `*.test.js`. So *Starfall* genuinely existed and was non-trivial.
2. **But the commit log under it tells yet another story:** `eb45f2e feat(sandbox): implement SPEC-176 ZeroTraceTeardown`, `a4081a0 feat(net): ... V8 isolated sandbox escape intrusion detection sentry (SPEC-175)`, `850f5af docs: create REVIEW_QUEUE.md`, `plan/specs/001_remediate_localtunnel_axios_cve.md`. That is the vocabulary of an **autonomous-coder / sandbox-security** project, not a space game. The repo appears to have been an agent-harness experiment that *also* carried a game payload.

Either way: **everything was purged on 2026-06-09**, and the README/GOAL describing the game were left behind as orphans.

---

## Architecture

There is no product architecture to review — nothing is wired to anything because there is nothing.

The **documented** architecture (in `README.md` lines 82–111 and `GOAL.md`) is aspirational and describes the deleted code: an authoritative Node/WebSocket server (`src/server.js`), pure deterministic simulation modules (`src/engine`, `src/physics`, `src/net`, `src/persistence`), a Canvas client (`src/client`), behind a swappable persistence store, with a server-side "galaxy heartbeat." This is a reasonable architecture *on paper* and matches what the purged tree actually contained. But as of this checkout it is **fiction relative to the working tree**: none of `src/`, `plan/`, `docs/AXIOMS.md`, `docs/AGENT-LOOP.md`, `docs/GOAL.md`, `docs/ai/REPO_MAP.md` exist.

The only "architecture" present is the operations engine's control plane (specs → builder → verify → judge → ship loop). That is intentionally not the review target.

---

## Code quality & correctness (file:line)

No product code exists, so there are no correctness bugs to find in a product. The defects are in the **truthfulness and consistency of what remains**:

1. **`README.md:14-33` — fabricated run instructions.** Tells the reader to `npm install` then `node src/server.js` and open `http://localhost:8080`. `src/server.js` does not exist; `package.json` has no `start`/`dev` script. These commands cannot work.
2. **`README.md:49-59` — fabricated validation gate.** Documents `npm run agent:check`, `npm run agent:check:core`, `npm test`, `npm run test:client`, `npm run format:check`. **None of these scripts exist** in `package.json` (which only defines `verify/shield/state/state:validate/typecheck/lint`). Every command in the README's "Validation" section is a dead reference.
3. **`README.md:65-78, 82-111` — pointers to non-existent files.** `docs/AXIOMS.md`, `docs/AGENT-LOOP.md`, `docs/GOAL.md`, `plan/PROGRESS.md`, `plan/specs/`, `docs/ai/REPO_MAP.md`, `docs/LOG.md`, `AGENTS.md §0` substrate list — all referenced, none present.
4. **`GOAL.md:9-12` — self-referential dangling pointers.** The on-disk spec says the live queue is `plan/PROGRESS.md` + `plan/specs/` and the loop prompt is `plan/GOAL_PROMPT.md`; none exist. It points to `AGENTS.md §0` and `docs/AGENT-LOOP.md` for the substrate list; the `docs/AGENT-LOOP.md` it names does not exist. `GOAL.md:65` ("Current Product State → Delivered or substantially delivered") asserts a long list of shipped systems that are **not in the tree**.
5. **`package.json:5` vs reality.** `"description": "Starfall: Living Galaxy — run by the AI operations engine"` — markets a product the repo does not contain. `"name": "agy-sandbox"` at least matches the directory.
6. **`roadmap/PROGRESS.md:1` — stale, misleading top entry.** "2026-06-14 — Queue FINISHED: F-0026 + F-0028 shipped … 31/31 passing." There are no F-0026/F-0028 features in `features.json` (it's `[]`), and nothing is "passing" because there is nothing to test. This is leftover state from the prior engine iteration and now reads as a false success claim.
7. **`roadmap/STATUS.md` / `roadmap/metrics.jsonl`** — empty stubs ("Not yet generated"; 0 bytes). Honest, at least, but they confirm no work has been recorded.

To be explicit about what is *good*: the repo is clean (`git status` empty), `package.json`/`tsconfig.json`/`biome.json` are coherent and minimal, and `docs/optional-modules.md` is an honest, well-scoped engine document. The rot is entirely in the inherited product-facing docs.

---

## Tests

**There are no product tests.** There is no test runner configured for a product: `package.json` has no `test` script (it has `typecheck` and `lint` only). There is no Jest, Vitest, or Playwright config in the tree. `roadmap/evidence/` is empty save a `.gitkeep`.

For context, the purged tree *did* have extensive co-located tests (e.g. `EconomyManager.test.js`, `GalaxyHeartbeat.test.js`, `CanvasRenderer.browser.test.js` with stored screenshots) — so the prior product took testing seriously. That coverage is gone with the code.

The engine's own gate (`scripts/verify.sh`, out of scope to critique) runs typecheck/lint/state/shield against the *scripts*, not a product. Per `docs/optional-modules.md`, real test/mutation/e2e gates are deliberately deferred until `src/` exists (PRODUCT_MODE flips). **Net: the product has no test or lint gate of its own because the product does not exist.**

---

## Security & data handling

No application code means no application attack surface (no auth, no network handlers, no data store, no user input handling to review). The only security-relevant assets are the engine's hooks/guards, which are out of scope.

Observations within scope:

- **No secrets in the tree.** No `.env`, no key material, no tokens found. `.gitignore` is present.
- **The purge claims nothing was lost** (commit `61a9aef` message: restorable via `git reset --hard pre-purge-20260609`). That means the *entire prior history*, including any secrets ever committed, remains reachable in git and on the GitHub remote. If the prior product ever committed credentials, deletion from HEAD does **not** remediate that — history rewrite + key rotation would be required. This is a latent risk to flag, not a confirmed leak (not audited here).
- The README instructs exposing the (non-existent) server to the public internet via `cloudflared tunnel` (`README.md:27-33`) with no mention of auth — irrelevant today, but a bad pattern to inherit verbatim when a server eventually lands.

---

## Unmerged branches

Local + remote branches: `chore/template-reset-20260614` (HEAD, current), `develop` / `origin/develop`, `main` / `origin/main`. `main` is *behind* develop (it sits at the purge commit `61a9aef`; develop adds the engine install `55f7b38`). The **only** branch with commits not in develop is the current one.

| Branch | What it is | Quality | Recommendation |
|---|---|---|---|
| `chore/template-reset-20260614` (current, `8fba0d2`, **2 commits ahead of develop**) | Reinstalls the current ai-operations-template engine and removes old ops-engine state + build cruft. Diff vs develop: 37 files, +1640/-122, entirely `.claude/`, `scripts/`, `.github/`, and doc/state files — **no product code**. | Coherent, scoped engine-maintenance work. Not independently reviewed here (engine is out of scope), but it does not touch a product because there is none. | **Finish & merge to develop** once the engine reset is intended to be the baseline. This branch should also carry the doc-truth fixes (this review, README, ROADMAP). It is the right home for the cleanup. |
| `develop` (`55f7b38`) | Default branch; "Install AI operations engine." | Engine baseline. | Keep as default. Receives the current branch. |
| `main` (`61a9aef`) | The purge commit; vision docs only, behind develop. | Stale relative to develop. | Fast-forward/realign to develop after the reset lands, or retire in favor of develop per the engine's `develop`-default policy. |

**Stranded work:** none in the conventional sense — there are no half-finished feature branches. The *real* stranded work is the **deleted Starfall product at `pre-purge-20260609`** (274 files). It is preserved in history and on the remote but is not on any live branch. Decision required (operator): resurrect it, mine it for a fresh start, or abandon it permanently.

---

## Tech debt & risks (ranked)

1. **(Critical) The docs lie about reality.** `README.md` and `GOAL.md` describe a running game with commands and file paths that do not exist. Anyone (human or agent) onboarding will follow dead instructions and form a false model of the repo. This is the single highest-leverage thing to fix and is fixed by deliverables B/C of this review.
2. **(Critical) No product, no decision recorded.** `features.json` is empty; there is no spec for what *agy-sandbox* should become now that Starfall was purged. The repo has no North Star that matches its contents. Until an operator decides "rebuild Starfall" vs "new product" vs "stay a template sandbox," every other task is premature.
3. **(High) Stale/false state files.** `PROGRESS.md` top entry claims "31/31 passing" for features that don't exist; `STATUS.md`/`metrics.jsonl` are empty. State and reality have diverged — exactly the drift the engine's own `--validate` guard is meant to catch.
4. **(High) `main` is behind `develop`** and points at the purge commit. Branch topology is mildly confusing; the canonical default should be unambiguous.
5. **(Medium) Latent secret-in-history risk.** The full pre-purge history (and any secrets it may contain) is still reachable. Not audited; flag for a quick `git secrets`/`trufflehog` pass before the repo is ever made public.
6. **(Medium) No product test/lint gate exists** (by design until `src/` lands) — fine now, but the moment any product code is added, a real `test` script and CI lane must land *with* it, not after.
7. **(Low) README's "expose via cloudflared, no auth" pattern** should not be copied into a future server without an auth story.

---

## Top 5 to fix first

1. **Make the docs tell the truth (done in this PR).** Rewrite `README.md` to say plainly: this is an empty engine-seeded sandbox; the prior Starfall product was purged (tag `pre-purge-20260609`); there is no `src/`, and the real scripts are `verify/typecheck/lint/state`. (Deliverable B.)
2. **Force the product decision.** Operator must choose, in writing: (a) restore Starfall from `pre-purge-20260609`, (b) start a new product, or (c) keep this as a pure template sandbox. Record it in `roadmap/QUESTIONS.md` → `DECISIONS.md`. Nothing else is well-defined until this is answered. (Captured in ROADMAP "Now.")
3. **Reset stale state files.** Clear/replace the false `PROGRESS.md` top entry; (re)generate `STATUS.md`; stop advertising "31/31 passing." State must match an empty backlog.
4. **Either rewrite `GOAL.md` to match the chosen product, or move it aside** (e.g. `docs/STARFALL_VISION_ARCHIVE.md`) so it stops masquerading as the live blueprint with dangling `plan/` pointers.
5. **Land the engine-reset branch and clarify branch topology** (`chore/template-reset-20260614` → `develop`; realign or retire `main`), so future agents start from one unambiguous, truthful baseline.

---

*This review covers the product (or absence thereof). The ai-operations engine scaffolding (`CLAUDE.md`, `AGENTS.md`, `AI_OPERATIONS_PLAN.md`, `OPERATOR_GUIDE.md`, `.claude/`, engine `scripts/`) was freshly installed and is intentionally excluded as a review target.*
