# 060 — Autonomy Safety & Truth Sync

- **Status:** In Progress
- **Wave:** A0 — Safety & Truth
- **Priority:** Critical
- **Primary goal:** make the autonomous control plane single-sourced, cross-platform safe, and gate-truthful before more feature work.

## Problem

The repo already has a capable autonomous harness. The risk is drift: multiple work queues, stale status anchors, a substrate check that did not run on every OS, local gates that differed from CI, and docs with hand-written numbers that became stale.

## Scope

### In

- Root agent manual and GitHub-agent rules.
- `docs/GOAL.md`, `README.md`, root `ROADMAP.md`, and plan-facing docs that point agents at the live queue.
- Package validation scripts and cross-platform substrate verification.
- CI and issue-triggered autonomous workflow alignment.
- AFK loop launchers preserving failed attempts instead of destructive cleanup.
- Issue runner safety: substrate write blocking, no force-push, branch-before-edit, and full gate validation.

### Out

- Modifying substrate files.
- Log rotation implementation; that should remain a separate discrete change.
- Generated `REPO_MAP.md` implementation; that is the next structural follow-up.
- New model benchmark claims unless verified against authoritative sources.

## Acceptance criteria

- [ ] `AGENTS.md` has one canonical read order pointing to `plan/PROGRESS.md` + `plan/specs/` as the live queue.
- [ ] `.github/AGENT_RULES.md` is a thin GitHub issue-flow delta and defers to root `AGENTS.md`.
- [ ] `docs/GOAL.md` is the product blueprint only, not the live work queue or loop prompt.
- [ ] `README.md` and `ROADMAP.md` do not contain stale hand-written test counts.
- [ ] `npm run agent:verify-substrate` verifies `scripts/manifest.txt` on every OS.
- [ ] `npm run agent:check` runs substrate integrity, format check, lint, typecheck, Jest, and client tests.
- [ ] CI runs substrate verification and uses Node versions compatible with `package.json`.
- [ ] The issue-triggered autonomous workflow runs on Node 24 or newer-compatible LTS policy.
- [ ] `scripts/run-agent.js` blocks substrate writes, creates a task branch before edits, runs `npm run agent:check`, and does not force-push.
- [ ] AFK loop scripts print `plan/PROGRESS.md` as the live anchor and preserve failed work for inspection.
- [ ] The full gate has actually run and passed before this spec is marked done.
- [ ] `plan/PROGRESS.md` and `docs/LOG.md` are updated after validation, or any missing update is explicitly recorded in the handoff.

## Verification commands

```bash
npm run agent:verify-substrate
npm run agent:check
```

Optional targeted checks:

```bash
npm run agent:check:core
npm run test:client
```

## Notes

This spec intentionally consolidates rather than adds a new control plane. If a future agent wants generated maps, log rotation, spec linting, server LOC ratchets, or JSON gate output, promote those as separate specs after this safety/truth sync lands green.
