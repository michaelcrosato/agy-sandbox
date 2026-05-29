# TICKET002 — AFK agent tooling & docs

- **Status:** DONE (2026-05-28)
- **Priority:** P1 (high)

## Goal
Make the repo AFK-ready for autonomous agents: a single CI-equivalent gate, cross-platform agent
scripts, a canonical entry doc, a repo map, and ignore/env scaffolding — without duplicating or
touching the substrate.

## Context
The local gate (`scripts/local-gate.ps1`) only checks for a clean tree, so format/lint/test drift
landed invisibly (CI's `prettier --check` was red). Agents also had no single entry point — the
substrate `docs/AGENT-LOOP.md` is read-only and product-spec-focused.

## Scope
- **In:** `package.json` scripts; `scripts/agent/*.{sh,ps1}`; `AGENTS.md`; `CLAUDE.md`;
  `docs/ai/REPO_MAP.md`; `ROADMAP.md`; `.aiignore`; `.env.example`.
- **Out:** Substrate files (§0 of AGENTS.md); rewriting `docs/GOAL.md`; pushing/merging.

## Likely files
- `package.json`, `scripts/agent/*`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `docs/ai/REPO_MAP.md`,
  `.aiignore`, `.env.example`.

## Steps (completed)
1. Added `format:check`, `agent:bootstrap`, `agent:check` npm scripts; `agent:check` = prettier+lint+test (CI mirror).
2. Wrote `scripts/agent/{bootstrap,doctor,check,test,lint,format,typecheck,status}` in both `.sh` and `.ps1`.
3. Wrote `AGENTS.md` (canonical) + thin `CLAUDE.md` pointer; deferred to the read-only substrate.
4. Wrote `docs/ai/REPO_MAP.md`, `ROADMAP.md`, `.aiignore`, `.env.example`.

## Acceptance criteria
- [x] `npm run agent:check` runs prettier --check + eslint + jest and is green.
- [x] `scripts/agent/*` exist for both shells and run on Windows (pwsh) and POSIX (bash).
- [x] `AGENTS.md` is the documented read-first entry; substrate untouched.
- [x] `.aiignore` and `.env.example` exist; no secrets committed.

## Commands
```bash
npm run agent:check
bash scripts/agent/doctor.sh
pwsh -File scripts/agent/check.ps1
```

## Risks
- None observed; all additions are net-new or composition over existing npm scripts. Verified green.

## Notes
`local-gate.ps1` is substrate and deliberately lightweight; `agent:check` is the real gate. Don't try
to "fix" the substrate gate — extend via `agent:check` instead.
