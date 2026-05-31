# SPEC-090 — Event-Loop Latency Monitoring & Dynamic Backpressure Shedding

- **Status:** Todo
- **Wave:** v20 — Phase 0
- **Priority:** Medium
- **Product Pillar:** P7 — Netcode & Scale (High-Latency Performance Hardening)

## Problem

Under heavy client loads or intensive CPU spikes (e.g., sector-wide space battles or batch database saves), event loop lag can increase, leading to delayed ticks and stuttering connections. To ensure the game server stays responsive, we need a lightweight Event-Loop Latency Monitor that actively tracks loop lag and triggers dynamic backpressure load-shedding (e.g., disabling optional visual animations, throttling redundant entity updates, or skipping non-essential chat broadcasts to high-lag connections) when lag exceeds critical limits.

## Scope

### In

- **Latency Monitor (`src/net/LatencyMonitor.js`):** Create a class that monitors the Event Loop delay by scheduling a high-resolution interval. Computes a rolling average of event loop lag.
- **Dynamic Load-Shedding Policies:** Implement a stateful backpressure throttle with clear thresholds:
  - **Normal (<25ms lag):** Send full updates.
  - **Degraded (25ms - 50ms lag):** Enable backpressure checks; drop non-essential chat histories and suppress verbose server notifications.
  - **Critical (>50ms lag):** Dynamic load-shedding; throttle optional entity state updates (e.g., skip broadcast of static objects or asteroids for lagging connections) and pause planetary cosmetic heartbeat updates.
- **Wired into server.js:** Track loop metrics dynamically, expose loop latency on `/metrics`, and apply throttling inside the client broadcast loops.
- **Testing:** Unit tests verifying correct latency calculation and dynamic threshold-based policy transitions.

### Out

- **Multithreading/Cluster Spawns:** Scaling out is already handled by workers; this spec deals strictly with inline process event loop safety and packet-level backpressure.

## Acceptance Criteria

- [ ] `src/net/LatencyMonitor.js` measures real-time event loop delay with rolling window averages.
- [ ] Exposes event loop lag in milliseconds on the `/metrics` API endpoint.
- [ ] Drops non-essential payloads or throttles optional broadcasts when the event loop is heavily degraded or critical.
- [ ] High Jest test coverage verifying all threshold trigger states.

## Verification Commands

```bash
npm test -- src/net/LatencyMonitor.test.js
npm run agent:check
```
