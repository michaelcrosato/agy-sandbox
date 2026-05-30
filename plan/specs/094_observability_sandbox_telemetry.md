# SPEC-094 — LLM Observability & Sandbox Resource Telemetry Recorder

- **Status:** Done
- **Wave:** v21 — Phase 2
- **Priority:** Medium
- **Product Pillar:** P1 — Persistent Living Universe / Sandbox Architecture (Observability & Telemetry)

## Problem

When the AI agent executes unattended over multiple days, there is no real-time observability into guest resource footprints (memory leaks, CPU locks, or disk volume growth). We need a structured sandbox telemetry subsystem to track CPU, memory, and disk usage in real time, aggregate them into standard `/metrics` outputs, and log any containment warnings or process delays.

## Scope

### In

- **Sandbox Telemetry Recorder (`src/net/SandboxTelemetry.js`):** Implement a class that:
  - Uses native Node `process.memoryUsage()`, `process.cpuUsage()`, and `fs.statSync` to measure resource utilization.
  - Computes peak memory footprints and tracks memory leak rates over long-duration agent loops.
  - Aggregates metrics into `/metrics` for dashboard plotting.
- **Observability dashboard integration:** Add resource usage sparklines and containment check statuses directly into the `/dashboard.html` interface.
- **Testing:** Unit tests verifying accurate metrics compilation and JSON serialization.

### Out

- **Host hardware-level profiling:** Tracks strictly the Node.js agent sandbox processes and repository directories, not general host hardware metrics.

## Acceptance Criteria

- [ ] `src/net/SandboxTelemetry.js` compiles CPU, memory usage, and repository disk metrics accurately.
- [ ] Resource metrics are exposed on the HTTP `/metrics` endpoint.
- [ ] Observe metrics plotted cleanly in dashboard integrations.
- [ ] 100% Jest test coverage.

## Verification Commands

```bash
npm test -- src/net/SandboxTelemetry.test.js
```
