# ROADMAP

This root roadmap is a short orientation layer. The live execution queue is [`plan/PROGRESS.md`](plan/PROGRESS.md) and the atomic specs are in [`plan/specs/`](plan/specs/). Product intent lives in [`docs/GOAL.md`](docs/GOAL.md). Operating rules live in [`AGENTS.md`](AGENTS.md).

## Current status (2026-07-12)

Waves v1–v50 (specs `001`–`177`) are complete, and a repository overhaul has landed: dead code
removed, flaky integration boots replaced with a readiness-polling harness, generated artifacts
un-committed, and documentation rewritten to match reality. The queue is empty; the historical
ledgers live in [`plan/archive/`](plan/archive/).

## Candidate next steps

1. **Product frontiers** (from [`docs/GOAL.md`](docs/GOAL.md)): squads/shared standing depth,
   generated-mission landing-flow polish, onboarding/game feel, multi-host scale proof.
2. **Engineering follow-ups** (from [`plan/BACKLOG.md`](plan/BACKLOG.md)): unify server logging on
   the structured JSON logger, revisit client-side prediction, Linux baselines for the browser
   visual suite.

## Standing rules

- Source of truth beats prose: verify against code, tests, CI, and recent log entries.
- Avoid hand-written test counts and LOC in docs; they drift.
- Use `npm run agent:check` as the full gate before claiming success.
- Keep substrate files read-only; `npm run agent:verify-substrate` enforces the manifest on every OS.
- Prefer small, green, reversible slices over broad rewrites.
