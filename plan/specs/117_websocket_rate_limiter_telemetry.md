# SPEC-117: Zero-Trust WebSocket Rate Limiter & Observability Telemetry

## Summary
Implement a high-throughput connection-level message rate limiter in the WebSocket server layer (`src/server/connectionHandlers.js`), cap maximum incoming frames per socket, and visualize these rate-limiting metrics dynamically inside the neon-cyan Living Codex Dashboard.

## Motivation
- A compromised or rogue client connection can flood a worker node with thousands of WebSocket requests per second, exhausting event loop cycles, delaying physics ticks, and causing latency spikes for peer pilots in the same sector.
- Enforces P0 Security (Denial of Service mitigation) and raises P2 Observability by exposing the connection metrics.

## Scope
**In:**
- Integrate a token-bucket rate limiter for each active client WebSocket connection in `handleConnectionAction` inside `src/server/connectionHandlers.js`.
- Cap the maximum request throughput to 100 messages/second (configurable), rejecting excess frames with a descriptive `rate_limit_exceeded` JSON warning message and dropping the processing of that frame.
- Track rate-limiting trigger counts inside `src/net/metrics.js`.
- Enhance the neon-cyan Living Codex Dashboard (`dashboard-codex.html`) with a real-time, zero-dependency SVG metric line chart visualizing sharded worker connection metrics and rate limit counts.
- Add robust Jest integration test coverage in `src/server/wsRateLimiter.integration.test.js` driving the rate-limiting filter.

**Out:**
- Do not introduce complex multi-connection IP address rate limiters at the TCP layer (keep filtering connection-focused and fast).

## Acceptance Criteria
- [ ] WebSocket connections exceeding 100 messages/sec are blocked and warned.
- [ ] Telemetry registers rate-limiting events accurately.
- [ ] Real-time SVG telemetry line charts successfully display rate-limiting occurrences on the Codex Dashboard.
- [ ] `npm run agent:check` green.
