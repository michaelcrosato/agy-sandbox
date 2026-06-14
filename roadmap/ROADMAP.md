# Roadmap

> **Operator: this is your file.** Plain-English bullets; reorder to change priorities. Agents only ever mark items "✅ shipped (PR #n)" — they never rewrite your words. Sections mean: **Now** = working on it, **Next** = queued, **Later** = someday, **Ideas** = unscoped thoughts.

## Now

- **DECIDE the product.** This sandbox has no product code; the prior *Starfall* game was purged on 2026-06-09 (tag `pre-purge-20260609`). Operator must choose, in writing, one of: (a) restore Starfall from the tag, (b) start a new product, (c) keep this as a pure template sandbox. Raise in `QUESTIONS.md`, record the answer in `DECISIONS.md`. Nothing below is well-defined until this is settled.
- **Stop the docs from lying.** (Largely done in this review: README rewritten, this roadmap, `docs/ENGINEERING_REVIEW.md` added.) Verify no remaining doc points at non-existent `src/server.js`, `plan/`, `docs/AXIOMS.md`, `npm run agent:check`, etc.
- **Reset stale state files.** Replace the false `roadmap/PROGRESS.md` top entry ("31/31 passing" for features that don't exist), regenerate `roadmap/STATUS.md`, ensure state matches the empty `features.json` (`[]`).

## Next

- **Land the engine-reset baseline.** Merge `chore/template-reset-20260614` → `develop` once it's the intended baseline (this is the only branch ahead of develop; +1640/-122, engine + docs only, no product code).
- **Clarify branch topology.** `main` is behind `develop` (it sits at the purge commit). Realign or retire it so the canonical default is unambiguous.
- **Decide product layout** (only after the "Now" product decision): `src/` vs packages structure — the engine defers this to the product (`docs/optional-modules.md`), it is not imposed by the template.
- **Stand up the product gate when first code lands.** A real `test` script + CI test lane must arrive *with* the first `src/` code, not after. PRODUCT_MODE in `verify.sh` flips on `src/` existence.

## Later

- **Activate optional engine modules as triggers fire** (see `docs/optional-modules.md`): placeholder check, mutation testing (StrykerJS), AST repo-map in briefs, E2E/staging lane, env-var name docs, semgrep/CodeQL — each gated on real product source existing.
- **Secret-in-history audit.** The full pre-purge history (and anything it may contain) is still reachable in git and on the remote. Run a `trufflehog`/`git secrets` pass and rotate anything found before the repo is ever made public; history rewrite if needed.
- **Public-repo readiness modules** (SECURITY.md, CONTRIBUTING.md, issue templates as consumers, CODE_OF_CONDUCT) — only when/if the repo goes public.

## Ideas

- **Mine, don't blindly restore, Starfall.** If the decision is to rebuild, consider cherry-picking the strongest purged modules (e.g. `src/engine/EconomyManager`, `GalaxyHeartbeat`, `FactionRegistry`) into a fresh, smaller vertical slice rather than resurrecting all 274 files wholesale.
- **First-session "fly in 60 seconds" smoke/e2e** as the product's North-Star acceptance test (from the archived `GOAL.md` product bar), if a player-facing game is the chosen direction.
- **Machine-generated repo map / metrics** so hand-written counts stop drifting from reality (a recurring failure mode visible in the purged product's docs).
