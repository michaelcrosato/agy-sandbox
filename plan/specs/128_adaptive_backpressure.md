# SPEC-128: Configurable Event-Loop Adaptive Backpressure Sentinel

## Summary
Extend the event-loop latency sentinel (`src/net/ResourceLimiter.js`) and config reload engine to support dynamic, non-downtime adaptive backpressure delay thresholds, enabling active workers to dynamically lower backpressure latency caps under concurrent server stress loads.

## Motivation
- Static latency caps (e.g. 50ms loop delay) are too rigid for varied cloud execution runtimes. Adaptive configuration reloading lets operators raise or lower backpressure limits in real-time without taking server processes offline.
- Enhances the P7 Scale and P2 Economy pillars.

## Scope
**In:**
- Support custom `latencySoftLimitMs` and `latencyHardLimitMs` parameters in `plan/config.json`.
- Expose dynamic updates to `ResourceLimiter` options via the `ConfigWatcher` propagation pipeline.
- Adapt the socket backpressure queueing and frame-shedding loops inside `src/server.js` to leverage these reloadable limits.
- Author comprehensive unit tests in `src/net/ResourceLimiter.test.js` or `src/net/ConfigWatcher.test.js`.

**Out:**
- Bypassed under JEST test environments to avoid false-positives under stress concurrency.

## Acceptance Criteria
- [ ] ResourceLimiter options are dynamically updated via ConfigWatcher without downtime.
- [ ] Active WebSocket ingestion rates adapt immediately to the newly propagated latency caps.
- [ ] Standard fallback defaults remain secure and robust when config variables are absent.
- [ ] Tests verify reload updates and dynamic limit changes.
