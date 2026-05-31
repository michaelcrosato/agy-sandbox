# SPEC-124: Automated Telemetry Anomaly Detector & Sentry

## Summary
Implement a high-performance, low-overhead rolling-average anomaly detection sentry (`src/net/AnomalyDetector.js`) that tracks real-time statistical deviations (standard deviations/Z-scores) in active connections, event-loop latency, and memory growth velocity, automatically logging warning alerts and registering triggers in telemetry.

## Motivation
- Fast and unpredictable load spikes, memory leaks, or DDoS connection floods can overwhelm workers. Automatic z-score statistical evaluation allows nodes to self-diagnose anomalous health transitions before fatal host caps are reached.
- Enhances the P2 Observability & Telemetry and P6 Self-Healing pillars.

## Scope
**In:**
- Create `src/net/AnomalyDetector.js` keeping low-overhead rolling numeric windows (e.g., last 60 observations) for connection counts, event-loop delay, and memory increments.
- Calculate dynamic means and standard deviations, flagging observations with a Z-score greater than 3.0 as anomalies.
- Expose the accumulated counts of anomaly triggers inside the `/metrics` API under `anomaly_triggers_total` and expose a diagnostic object.
- Create exhaustive ESM unit tests in `src/net/AnomalyDetector.test.js`.

**Out:**
- Avoid complex statistical models or external heavy packages (like mathjs); execute pure, optimized floating-point array variance logic.

## Acceptance Criteria
- [ ] AnomalyDetector correctly calculates rolling means, standard deviations, and Z-scores of resource dimensions.
- [ ] Z-score deviations exceeding 3.0 correctly raise warning logs and increment telemetry.
- [ ] Complete Jest unit tests cover stable states, deviation triggers, and telemetry hooks.
- [ ] Verification gate check remains fully green.
