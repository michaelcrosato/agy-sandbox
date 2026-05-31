# SPEC-116: Resource Allocation Limits & Memory/CPU Backpressure Sentinels

## Summary
Develop a programmatic, light-overhead resource monitor and backpressure sentinel (`src/net/ResourceLimiter.js`) that regularly polls host system/thread health metrics (memory usage, CPU time) and actively prevents runaway infinite loops or Out-Of-Memory (OOM) failures by capping limits and gracefully draining connections.

## Motivation
- AI agents executing automated recursive tests can occasionally spawn infinite loops or memory leaks, resulting in runaway resource exhaustion that locks or crashes the unattended hosting sandbox.
- Supports the P2 Observability & P7 Scale pillars by maintaining stable latency and stable resource peaks.

## Scope
**In:**
- Create `src/net/ResourceLimiter.js` which regularly monitors memory allocation (`process.memoryUsage()`) and CPU usage.
- Define strict threshold configuration bounds (e.g., maximum 512MB memory usage per worker process, max 20ms Event Loop delay).
- When a threshold is crossed, trigger a soft backpressure limit: temporarily pause inbound socket message processing, call `global.gc()` if available to actively release garbage, and request client message throttling.
- If memory allocation continues to rise and crosses a hard cap, safely and gracefully shut down the worker process using `ProcessReaper` to avoid host OOM crashes.
- Design comprehensive unit tests in `src/net/ResourceLimiter.test.js` validating the rate and limit triggers under mocked high-allocation scenarios.

**Out:**
- Do not run continuous heavy system shell commands (like top/ps/tasklist) to keep polling overhead minimal (under 0.5% CPU).

## Acceptance Criteria
- [ ] Resource monitor correctly tracks memory/CPU utilization.
- [ ] Soft backpressure limit pauses socket ingestion when thresholds are crossed.
- [ ] runaway allocation triggers clean worker teardown via ProcessReaper to prevent system crashes.
- [ ] `npm run agent:check` green.
