# ROADMAP

This root roadmap is a short orientation layer. The live execution queue is [`plan/PROGRESS.md`](plan/PROGRESS.md) and the atomic specs are in [`plan/specs/`](plan/specs/). Product intent lives in [`docs/GOAL.md`](docs/GOAL.md). Operating rules live in [`AGENTS.md`](AGENTS.md).

## Current priority

1. **A0 — Autonomy Safety & Truth Sync**
   - Finish [`plan/specs/060_autonomy_safety_truth_sync.md`](plan/specs/060_autonomy_safety_truth_sync.md).
   - Verify `npm run agent:check` after the connector-authored changes land.
   - Do not mark A0 complete until the full gate has actually run.

2. **A1 — Token-efficient truth sources**
   - Rotate `docs/LOG.md` into `docs/log/YYYY-MM.md` once validation is available.
   - Generate/check `docs/ai/REPO_MAP.md` rather than hand-maintaining volatile LOC/test counts.
   - Add a spec template/linter so future specs remain executable.

3. **A2 — High-risk seam reduction**
   - Continue extracting `src/server.js` behavior into tested modules.
   - Add server/client smoke coverage for claims that unit tests cannot prove.
   - Add worktree/file-set collision controls before concurrent subagent runs.

4. **Product wave v9**
   - Resume product work from the top unblocked item in `plan/PROGRESS.md` after A0 is green.
   - Current product frontiers include fittings/loadout presets, squads/shared standing, generated mission landing-flow wiring, onboarding/game feel, and multi-host scale proof.

## Standing rules

- Source of truth beats prose: verify against code, tests, CI, and recent log entries.
- Avoid hand-written test counts and LOC in docs; they drift.
- Use `npm run agent:check` as the full gate before claiming success.
- Keep substrate files read-only; `npm run agent:verify-substrate` enforces the manifest on every OS.
- Prefer small, green, reversible slices over broad rewrites.
