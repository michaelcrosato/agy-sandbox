# 019c — Worker process model

- **Phase:** 2 (scale-out) · **Priority:** P2 (GOAL P7) · **Blocked by:** `019b` (recommended) · **Parent:** `019`

## Description & Expected Impact
The server is a single process pinned to one core. 2026 scaling practice runs **N worker processes**
(~50–100k conns each) behind a router. **Impact:** rooms run across cores/hosts — the path from tens to
thousands of CCU.

## Definition of Done & Acceptance Criteria
- [ ] A supervisor spawns `WORKERS` worker processes (Node `cluster`/`worker_threads`/child procs), each
      running the existing single-process server bound to the shards it owns (via `assignShard` +
      `RoomRegistry`). `WORKERS=1` (default) is byte-identical to today's single process.
- [ ] The spawn/restart policy (which worker owns which shard, crash-restart, backoff) is a **pure decision
      function**, unit-tested independent of real processes.
- [ ] An integration test boots 2 in-process workers and asserts a room routes to and runs on the correct
      worker; `npm run agent:check` green; single-process boot unchanged.

## Implementation Approach
- New `src/server/supervisor.js`: pure `planWorkers({ shardCount, registry, liveWorkers })` deciding
  spawn/assignment/restart, plus a thin spawn shim around it. Reuse `roomRouter.assignShard` + `RoomRegistry`.
- Keep the engine process-agnostic; only orchestration changes. Gate behind `WORKERS` (default 1).

## Test Strategy
- **Unit:** `planWorkers` decisions across shard counts, dead/live workers, rebalances (deterministic).
- **Integration:** 2 in-test workers (or worker_threads) + a shared store; a room handed to worker B runs
  and persists there.
