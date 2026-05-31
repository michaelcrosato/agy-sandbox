# SPEC-093 — State Leakage Defender & Workspace Isolation Sandbox

- **Status:** Todo
- **Wave:** v21 — Phase 0
- **Priority:** High
- **Product Pillar:** P1 — Persistent Living Universe / Sandbox Architecture (Workspace Isolation)

## Problem

Files created during test suites or agent self-corrections (like screenshots under `.vitest-attachments/`, lock files, test databases under `data-test-*/`, or local logs) can accumulate outside git tracking. This leads to state-leakage between runs, causing dynamic sector loads or persistent state restores to act non-deterministically. We need a state isolation sweep script to sanitize the workspace back to a mathematically clean baseline.

## Scope

### In

- **Workspace Sanitize Script (`scripts/agent/workspace-sanitize.ps1`):** Develop a script that runs before and after each task. It must:
  - Detect and remove untracked temporary directories (e.g. `data-test-*`, `.vitest-attachments/*.png`, `.git-commit-msg.txt`).
  - Keep write-protected logs and active `/plan/` directories strictly intact (exclude `docs/LOG.md`, `plan/`, and `.agents/`).
  - Clear system temp files created by Node.js or Vitest inside the repository volume.
- **Git integration:** Re-run workspace sanitizing within the git pre-task baseline hook to assert a perfectly clean, predictable checkout.
- **Testing:** A test suite verifying that untracked directories are swept while the `/plan/` and ledger logs are safely preserved.

### Out

- **Host-level directory sweeps:** Only files within the guest `agy-sandbox` repository directory are sanitized.

## Acceptance Criteria

- [ ] `scripts/agent/workspace-sanitize.ps1` detects and cleans up untracked temporary files and directories.
- [ ] Preserves `/plan/` files, `.agents/rules/`, and `docs/LOG.md` perfectly during sweeps.
- [ ] Integrates into the pre-task git workflow for predictable execution states.
- [ ] 100% successful execution checks.

## Verification Commands

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/workspace-sanitize.ps1
```
