# SPEC-121: Automated Memory Leak Sentry & Self-Healing Garbage Collection

## Summary
Build a lightweight memory leak governance sentinel (`src/net/MemoryLeakSentry.js`) that polls heap growth rates, registers alert thresholds, automatically schedules `global.gc()` sweeps when growth velocity crosses 5MB/minute under active load, and reports diagnostics to the Codex observability console.

## Motivation
- AI sandboxes and continuous long-running game simulators are prone to slow-growing memory leaks (e.g. uncleared intervals, stale socket registries, or un-reaped processes) that eventually crash the host with Out Of Memory (OOM) failures.
- Strengthens the P0 Security (Teardown & Clean Lifecycles) and P2 Observability pillars.

## Scope
**In:**
- Coded `src/net/MemoryLeakSentry.js` utilizing `SandboxTelemetry` metrics to calculate memory growth rates in bytes per minute over sliding windows.
- Automatically schedule soft GC sweeps (`global.gc()`) when memory growth exceeds 5MB/minute under active connection states.
- Expose a `/metrics` key `memory_leak_alerts` detailing total leak alerts triggered and the current computed growth velocity.
- Author robust unit tests in `src/net/MemoryLeakSentry.test.js` validating mock leak detection bounds.

**Out:**
- Do not trigger alerts or GC sweeps on start-up noise or short connection spikes.

## Acceptance Criteria
- [ ] MemoryLeakSentry successfully computes heap growth velocity over time.
- [ ] Self-healing garbage collection triggers correctly when simulated limits are crossed.
- [ ] Telemetry endpoint '/metrics' details memory leak diagnostics.
- [ ] CI validation checks remain fully green.
