# SPEC-123: Game Loop Physics Determinism Audit Sentry

## Summary
Implement a high-performance physics-loop determinism auditing utility (`src/engine/DeterminismSentry.js`) that computes tick-by-tick state hashes of entity positions, velocities, and faction standings, alerting on state drifts between sharded runs or reconnect states.

## Motivation
- Network updates and floating-point computations across sharded nodes can introduce non-deterministic state drifts. Early detection and telemetry reporting ensure absolute simulation purity and repeatability.
- Enhances the P1 Core Determinism and P2 Observability pillars.

## Scope
**In:**
- Coded `src/engine/DeterminismSentry.js` providing standard FNV-1a hash generators for vector positions and key numeric fields.
- Compute tick-by-tick galaxy checksums and compare state hashes across consecutive frames.
- Alert on non-deterministic drifts (e.g. coordinates diverging without active controls) and log warnings.
- Expose a `/metrics` key `determinism_drift_alerts_total`.
- Author robust unit tests in `src/engine/DeterminismSentry.test.js`.

**Out:**
- Do not run expensive cryptographical hashing (e.g. SHA-256) inside the tight 30Hz game loop; utilize lightweight FNV-1a or XOR arithmetic to protect execution performance.

## Acceptance Criteria
- [ ] DeterminismSentry correctly hashes entity state matrices using FNV-1a.
- [ ] State drifts and non-deterministic deviations trigger warning telemetry.
- [ ] Test coverage verifies the detection and alerting thresholds.
- [ ] Verification gate check remains fully green.
