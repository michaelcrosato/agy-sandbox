# SPEC-127: Inbound Connection Flood Protection & Active IP Sentry

## Summary
Build a secure connection flood guardian (`src/net/ConnectionFloodSentry.js`) that tracks active WebSocket connections by client remote IP addresses, enforcing a strict configurable limit of maximum 5 concurrent sockets per IP, and strictly validating raw TCP upgrade payload lengths at the HTTP server level to proactively prevent memory exhaustion.

## Motivation
- Untrusted environments expose the multiplayer server to distributed socket flood attacks. Enforcing connection-per-IP limits and raw upgrade payload length filters at the socket upgrade level shields V8 memory footprints from OOM vulnerabilities.
- Enhances the P3 Security and P7 Scale and Netcode pillars.

## Scope
**In:**
- Build `src/net/ConnectionFloodSentry.js` tracking active connections per IP.
- Enforce a max concurrent WebSocket connections boundary per unique remote IP (default 5).
- Intercept HTTP `upgrade` requests in `src/server.js` to reject excess connections from the same IP at the gateway boundary.
- Integrate the flood limits configuration inside the hot config reloading pipeline in `plan/config.json`.
- Create complete ESM unit tests in `src/net/ConnectionFloodSentry.test.js`.

**Out:**
- Do not affect local test runners or loopback mock workers during concurrent stress test suites.

## Acceptance Criteria
- [ ] ConnectionFloodSentry tracks and enforces connection limits per unique IP.
- [ ] Connection requests exceeding the IP ceiling are immediately dropped at the upgrade level with a 429 status code.
- [ ] Dynamic parameters are fully reloadable via the ConfigWatcher.
- [ ] Extensive test suites verify limits, increments, decrements, and upgrade rejections.
