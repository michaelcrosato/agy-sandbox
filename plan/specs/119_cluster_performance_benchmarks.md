# SPEC-119: Clustered Performance Regression Benchmarks & Latency Gates

## Summary
Develop a programmatic, lightweight performance benchmark harness (`scripts/agent/cluster-benchmark.js`) that spawns concurrent sharded workers and scales mock client workloads, asserting that event loop delays remain below 30ms and message serialization latency stays optimized under high load.

## Motivation
- Unattended recursive code changes can introduce slow algorithms or memory leaks that slowly degrade the simulator's frame rate and stability, resulting in latent performance regressions.
- Raises the P7 Scale and P2 Observability pillars.

## Scope
**In:**
- Build `scripts/agent/cluster-benchmark.js` bootstrapper spawning 3 sharded workers and a frontend LB proxy.
- Simulate 50 concurrent headless clients performing high-frequency flight, combat, and market transactions for 5 seconds.
- Measure and print precise performance indicators: average event-loop latency, peak heap utilization, total frames processed, and broadcast egress bytes/sec.
- Set a strict gate threshold: average event loop latency must not exceed 40ms, and total execution must exit with 0.
- Expose the runner as an npm script `npm run benchmark:cluster`.

**Out:**
- Do not run continuous heavy profiling tools (like v8-profiler) to keep the benchmark run fast and lightweight.

## Acceptance Criteria
- [ ] Benchmark runner successfully orchestrates sharded load workloads.
- [ ] Average event loop latency and peak memory usage are printed and verified.
- [ ] Exit code 0 is returned when performance thresholds are successfully satisfied.
- [ ] `npm run agent:check` remains fully green.
