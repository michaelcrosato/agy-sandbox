# SPEC-092 — Automated Zombie Process Reaper & Orphan Port Cleanup

- **Status:** Todo
- **Wave:** v21 — Phase 0
- **Priority:** High
- **Product Pillar:** P7 — Netcode & Scale / Sandbox Architecture (Zombie Mitigation)

## Problem

When the autonomous agent loop executes client/server integration tests or runs mock processes, background server worker threads, child processes, or socket listeners can leak. If a test times out, crashes, or is killed, these child processes become orphan/zombies, locking system ports (such as 18082, 18195) and draining memory. This causes subsequent ticks to fail with "EADDRINUSE" and leads to event loop exhaustion. We need a robust `ProcessReaper` system to automatically track, intercept, and force-kill any leaked child processes, workers, and sockets.

## Scope

### In

- **Pure Process Reaper (`src/net/ProcessReaper.js`):** Implement a modular Node.js class that:
  - Registers and tracks all spawned `Worker` threads and child processes.
  - Automatically sweeps and force-terminates tracked resources when `reap()` is called (e.g. inside `afterEach` or `afterAll` hooks).
  - Can scan specific TCP port ranges (e.g., 18000–18200) and close bound sockets or report locks.
- **PowerShell Teardown Harness (`scripts/agent/cleanup-orphans.ps1`):** Develop a host-side script that executes after each task run, scanning for any orphaned Node.js processes or locked ports and force-killing them (`Stop-Process`).
- **Heartbeat Hook:** Integrate a periodic reap sweep in `server.js` and `roomGc.js` to ensure closed workers are fully gc'd.
- **Testing:** Jest unit tests in `src/net/ProcessReaper.test.js` verifying that spawned workers are successfully registered, tracked, and force-killed on command.

### Out

- **Host root-level system process sweeps:** Sweeping arbitrary non-Node processes is out-of-scope; we focus strictly on local sandbox processes and ports.

## Acceptance Criteria

- [ ] `src/net/ProcessReaper.js` registers, tracks, and force-kills background workers and child processes.
- [ ] `scripts/agent/cleanup-orphans.ps1` scans the port range and cleans up orphaned Node/npm tasks on Windows.
- [ ] Spawning and leaving active worker threads is successfully detected and reaped cleanly.
- [ ] Verification command runs cleanly, leaving zero leaked ports or zombie workers.

## Verification Commands

```bash
npm test -- src/net/ProcessReaper.test.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/agent/cleanup-orphans.ps1
```
