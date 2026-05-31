# SPEC-159: Centralized Commodities Schema Registry & Real-Time Production Chain Invariant Monitor Sentry

## Summary

Establish a centralized commodities schema registry and validation mechanism in the headless engine to ensure all simulated goods conform to strict specifications. Build a real-time production chain invariant monitor that runs during the `GalaxyHeartbeat` economic tick to audit and log economic drifts, pricing imbalances, and invalid negative states, routing alerts into `SandboxSecurityRegistry` and telemetry metrics.

## Motivation

- Hardens the emergent economy (P2) against silent drift, pricing overflows, and negative inventory rates.
- Improves observability (P1/P7) by exposing economic metrics (e.g. inflation indices, trade volumes, production rates) under `/metrics` and the Codex cockpit telemetry.

## Scope

**In:**

- Develop a centralized `CommoditiesRegistry` inside `src/engine/EconomyManager.js` to define, validate, and maintain schemas for all active trade commodities (ore, fuel, alloys, tech, electronics, contraband).
- Implement a real-time invariant checker running alongside `GalaxyHeartbeat.js` executing strict rules: commoditiy counts are non-negative, price bounds are within safe margins (e.g. 5 to 5000 credits), and production conversion rates remain conservative.
- Log economic drift anomalies or invariant violations directly into `SandboxSecurityRegistry` as category `economy` and expose them under `/metrics`.
- Authored robust Jest tests in `src/engine/EconomyManager.test.js` or `src/engine/EconomyRegistry.test.js` verifying schema validations and heartbeat invariant audits.

**Out:**

- Do not change existing pricing calculations or base market items; only validate and log telemetry metrics to secure system integrity.

## Acceptance Criteria

- [ ] Centralized commodities schema registry defines and validates commodity attributes.
- [ ] Heartbeat invariant monitor sweeps economic assets and asserts non-negative bounds and safe margins.
- [ ] Telemetry `/metrics` exposes active economic drift counts and inflation indicators.
- [ ] Dedicated unit tests cover commodity validations, invariant blocks, and heartbeat telemetry updates.
