# JOURNAL — cycle-by-cycle working log (newest first)

Append one entry per loop cycle. Cycles 1–55 (2026-05-30 → 2026-06-20) are archived at
[`archive/JOURNAL-2026-05.md`](archive/JOURNAL-2026-05.md).

## 2026-07-12 — Repository overhaul (manual maintenance session)

- Removed dead modules (`src/index.js`, `ShardedStore`, `DeltaStateCodec`, `SchemaCodec`,
  `NetworkLatencyInjector`, `EphemeralSandbox`, `MainThreadWatchdog` trio, client `Reconciler`),
  merged the misspelled `src/client/__tests` directory into `src/client/__tests__`, and dropped the
  broken optional `localtunnel` startup path.
- Added `src/server/testSupport/integrationHarness.js` (readiness polling instead of fixed boot
  sleeps) and adopted it across the integration suites; made the SPEC-117 rate-limiter test flood
  continuously so it cannot flake on slow runners.
- Un-committed generated artifacts (`plan/CODEX.md`, `plan/codex.json`, `plan/monitoring_report.json`,
  `browser_recordings/`) and widened `.gitignore` for runner scratch files.
- Deleted stale one-off docs (`PROJECT.md`, `REVIEW_QUEUE.md`, `plan/mock_issue.md`,
  `.agent-cleaner/`, `tickets/`, `docs/ai/FEATURE_PLAN.md`) and archived the historical plan ledgers
  under `plan/archive/`.
- Rewrote `.env.example` to cover the full environment surface actually read by the code.
