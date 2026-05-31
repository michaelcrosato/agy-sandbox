# SPEC-073 — Observability Teleboard Sparkline Chart Extensions

## Description
This specification expands the premium glassmorphic live observability dashboard `/dashboard.html` with real-time vector-based sparkline charts. It adds smooth, canvas-drawn sliding line graph components visualizing critical server health diagnostics (tick processing times, broadcast bandwidth, and enqueued matchmaking lengths) over a rolling history window.

1. **Vector Canvas Sparkline Components:**
   - Implement lightweight, self-rendering canvas charting components inside `dashboard.html` to avoid heavy external charting frameworks.
   - Smoothly draw sliding line graphs tracking real-time server metrics polled from the authoritative `/metrics` JSON endpoint.

2. **Metric Logging & History Windows:**
   - Store rolling histories of metric data points (max 50 points) directly in client-side memory.
   - Visualize system loads, connection throughput, and player queues.

## Definition of Done (DoD)
- [ ] Implement three separate canvas sparkline graphs on `/dashboard.html` showing tick rates, bandwidth, and matchmaking queue sizes.
- [ ] Ensure the dashboard continues loading cleanly and fetches live data correctly under `/metrics`.
- [ ] Add integration tests in `src/server/dashboard.integration.test.js` validating HTTP rendering and telemetry metric serving.
- [ ] Gate check `npm run agent:check` and Vitest browser checks pass completely green.

## Implementation Approach
- Use standard HTML5 `<canvas>` elements placed in card headers.
- Write a simple pure JS `drawSparkline(canvasId, dataPoints)` drawing grid lines and a glowing colored path representing historical metric logs.

## Test Strategy
- Assert that `/dashboard.html` serves properly and contains canvas element selectors.
