# SPEC-140: Guest CPU Time-Slice Budget Monitor & Watchdog

## Summary
Implement a high-performance, non-blocking CPU time watchdog inside `GuestRunner.js` that tracks the cumulative CPU time (user + system) consumed by running guest processes. If a guest process exceeds its configured CPU time budget (default 2 seconds of total CPU time), the runner will forcefully kill the child process via `ProcessReaper` SIGKILL and log a CPU exhaustion breach violation to `SandboxSecurityRegistry`.

## Motivation
- Guest processes might execute infinite tight loops (e.g. `while(true) {}`) or perform massive cryptographic calculations, pegging a host CPU core at 100% utilization.
- While the background watchdog prevents main-thread event loop blocks, a separate CPU slice tracker is required to prevent child processes from hogging host CPU cores and degrading concurrent sandbox workloads.

## Scope
**In:**
- Update `GuestRunner.js` to accept a `cpuTimeBudgetMs` option (defaulting to `2000` ms).
- Implement a periodic polling interval (e.g., every 100ms) inside the host `GuestRunner` to monitor CPU consumption.
- Use `process.cpuUsage()` (or query child process CPU parameters in a cross-platform manner) or use high-resolution CPU metrics. Wait, child processes do not expose direct cross-platform cpuUsage methods natively from Node childProcess object. However, the child worker can periodically poll its own `process.cpuUsage()` and report it back to the host via IPC, or the host can track high-resolution process execution duration and CPU boundaries. Let's design an IPC reporting channel where `GuestRunnerWorker.js` periodically reports its own `process.cpuUsage()` user and system parameters, or the host tracks total CPU usage.
- If cumulative CPU usage (user + system time) reported by the worker (or elapsed runner time if IPC is blocked) crosses `cpuTimeBudgetMs`, dispatch `ProcessReaper.killPid(pid)` instantly.
- Log the CPU breach violation to `SandboxSecurityRegistry` under the `"cpu_exhaustion"` category.
- Author robust unit tests in `src/net/GuestRunner.test.js` validating that dynamic infinite tight-loop scripts are detected and forcefully reaped before they can exhaust host cores.

**Out:**
- Do not introduce heavy native resource-monitoring npm packages (keep dependencies zero-trust and pure JS).

## Acceptance Criteria
- [ ] GuestRunner supports cumulative CPU time budgets for active child execution runs.
- [ ] Child processes report or monitor user and system CPU times under budget bounds.
- [ ] Guest processes running infinite tight loops are reaped via SIGKILL when exceeding budgets.
- [ ] Breach violations are recorded with full telemetry details inside the persistent security registry.
