# 010 — Observability: structured logging + runtime metrics

- **Phase:** 1 · **Priority:** P1 (observability gap) · **Blocked by:** none (cleaner after 007)

## Description & Expected Impact
The server uses ad-hoc `console.*` with no structure and exposes **no runtime metrics**, so there's no
way to see CCU, room count, tick duration, broadcast bandwidth, or error rates — you can't tell if the
server is healthy or why it slowed. **Impact:** makes the "server dreams" claim observable; provides the
data to validate `004` backpressure, `014` interest management, and `015`/`019` perf work.

## Definition of Done & Acceptance Criteria
- [ ] A tiny pure metrics registry (counters/gauges/rolling averages) with `snapshot()` — no external deps.
- [ ] Server records: connected clients (gauge), rooms (gauge), per-tick duration (rolling avg/max),
      bytes broadcast/sec, messages in/sec, terminated-slow-clients (counter), heartbeat reaps (counter).
- [ ] A read-only `GET /metrics` (or `/healthz`) endpoint on the existing HTTP server returns the JSON
      snapshot; no auth needed for localhost, gated/简 off in production via env if desired.
- [ ] A thin structured logger (`{level, ts, msg, ...fields}` JSON) replaces hot-path `console.*`
      (leave low-traffic logs as-is to keep the diff small).
- [ ] Registry + logger are unit-tested; `npm run agent:check` green; `node src/server.js` boots and
      `/metrics` responds.

## Implementation Approach
- New pure `src/net/metrics.js` (`createRegistry()` → `inc/observe/gauge/snapshot`) and
  `src/net/logger.js` (`createLogger({level})` → leveled JSON lines). No dependencies.
- Wire counters at the natural points in `server.js` (connect/close, tick start/end, broadcast send,
  backpressure drop, heartbeat reap). Add the `/metrics` route to the existing static HTTP handler.
- Keep the registry injectable so tests don't need a server.

## Test Strategy
- **Unit (`metrics.test.js`):** counters increment, gauges set, rolling avg/max correct, `snapshot()` is
  a plain JSON-safe object. **Unit (`logger.test.js`):** respects level filter, emits valid JSON, never
  throws on circular-ish fields. Deterministic (inject a clock).
- **Manual:** boot, `curl localhost:8080/metrics` returns the snapshot.
