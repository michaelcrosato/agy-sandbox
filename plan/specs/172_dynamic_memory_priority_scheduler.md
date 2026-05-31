# SPEC-172: Dynamic Memory & CPU Priority Scheduler Sentry

## Summary

Design and build a dynamic guest process resource scheduler and governor (`DynamicResourceGovernor.js`) that monitors host system limits alongside active guest process workloads. When host system resources are constrained (e.g., high memory usage or CPU load), the governor dynamically queues guest script launches, throttles active guest processes via dynamic OS priority adjustments, and adapts guest heap allocations to safeguard host execution loops.

## Motivation

- Protects the unattended multi-day agent laboratory from host OOM crashes or resource starvation under high parallel workloads.
- Provides dynamic, context-aware scheduling of AI processes based on actual host OS metrics.
- Integrates system-level metrics into the centralized `/metrics` telemetry endpoints.

## Scope

**In:**

- Create `src/net/DynamicResourceGovernor.js` to poll host OS-level CPU load and free memory ratios using Node's native `os` module.
- Manage a guest launch queue (`GuestLaunchQueue`) that delays script executions when host free memory drops below 15% or host CPU load exceeds 85%.
- Dynamically lower the CPU execution priority of running guest processes (utilizing Node's native `os.setPriority` API) if they cross 80% of their allocated memory or CPU time-slice budgets.
- Expose resource governor metrics under `/metrics` including queued runs count, active throttled processes, and host capacity indicators.
- Write extensive Jest tests in `src/net/DynamicResourceGovernor.test.js` validating queuing logic and priority scheduling transitions.

**Out:**

- Do not alter the standard static budgets of sandboxes unless host system resource stress thresholds are actively crossed.

## Approach

1. **System Resource Poller:**
   - Periodically check `os.freemem() / os.totalmem()` and CPU load averages via `os.loadavg()`.
   - Track active guest runs registered in `GuestRunner.activeRuns`.

2. **Launch Queue Integration:**
   - Integrate the queue wrapper directly into `GuestRunner.runScript()`. If the host is under stress, return a promise that resolves only when active runs complete and host capacity recovers.

3. **Dynamic Priority Throttling:**
   - A periodic sweeps interval evaluates running guest PIDs. Processes exhibiting near-budget utilization are programmatically set to low scheduling priority 19.

## Acceptance Criteria

- [ ] Guest runs are queued and throttled gracefully when simulated host resource stress is high.
- [ ] Active near-budget guest processes are programmatically down-prioritized.
- [ ] Comprehensive unit tests verify that resource stress triggers correct scheduler states and teardown is completely clean.
