# BACKLOG — adjacent ideas surfaced during execution

Items noticed mid-spec that are out of the current spec's scope. Triage into `specs/` when prioritized.

- Client-side input prediction/reconciliation: the unwired `Reconciler` prototype (spec 071) was
  removed in the 2026-07-12 overhaul; reintroduce it wired into `NetworkHandler` if input latency
  becomes a complaint (recover the code from git history).
- Structured logging: server modules mix emoji `console.log` lines with the JSON logger in
  `src/net/logger.js`; unify on the structured logger.
- Browser visual suite (`npm run test:client:browser`) is Windows-only (win32 golden screenshots)
  and not in CI; add Linux baselines if it should gate merges.
