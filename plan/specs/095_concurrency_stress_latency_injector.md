# SPEC-095 — Adv Evals: High-Concurrency Sandbox Stress-Testing & Network Latency Injector

- **Status:** In Progress
- **Wave:** v22 — Phase 0
- **Priority:** High
- **Product Pillar:** P7 — Netcode & Scale / P3 — Adv Evals

## Problem

To prove that our WebSocket backpressure, event-loop latency-monitoring, and load-shedding policies are resilient in high-density multi-player scenarios, we need a deterministic stress-testing and network latency injector suite. Running real concurrent connections inside tests is often flaky; we need a simulated latency/loss injector hookable directly into socket connections combined with a headless concurrent load runner to evaluate the server's operational envelopes.

## Scope

### In

- **Network Latency Injector (`src/net/NetworkLatencyInjector.js`):** Implement a utility that wraps WebSocket connection streams or mock sockets to inject artificial network delay (latency in ms) and simulated packet loss (ratio 0-1) to evaluate client reconciliation.
- **Concurrent Load Runner (`scripts/agent/stress-test.js`):** Create a standalone script using lightweight headless client connections to spawn up to 100 concurrent mock pilots flying, trading, and broadcasting in the same sector.
- **Integration Test Suite:** An automated evaluation test (`src/server/stressConcurrency.integration.test.js`) verifying:
  - Backpressure frame-shedding actively triggers when event loop lag is artificially induced.
  - No connection leaks or socket hangs occur under concurrent client shutdowns.

### Out

- **Host-level physical router latency:** The latency injection is entirely application-level, ensuring it remains fully portable across Windows, Linux, and headless CI runners.

## Acceptance Criteria

- [ ] `src/net/NetworkLatencyInjector.js` correctly delays packet broadcasts and drops frames based on configurable latency and loss-ratio sliders.
- [ ] `scripts/agent/stress-test.js` can spawn 50+ simulated headless pilots performing flight/trade loops concurrently.
- [ ] Integration tests verify that frame-shedding rules trigger under heavy induced load with zero process crashes.
- [ ] Teardown logic cleanly terminates all mock clients and releases bound socket ports with 100% success.

## Verification Commands

```bash
npm test -- src/server/stressConcurrency.integration.test.js
```
