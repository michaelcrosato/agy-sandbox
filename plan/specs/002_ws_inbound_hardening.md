# 002 — Harden ws inbound: maxPayload + Origin verification

- **Phase:** 0 · **Priority:** P0 (security) · **Blocked by:** none

## Description & Expected Impact
`src/server.js` constructs `new WebSocketServer({ server })` with no limits. Two 2026-baseline gaps:
1. **No `maxPayload`** → a client can send an arbitrarily large frame, forcing unbounded buffering /
   JSON.parse on the event loop (DoS).
2. **No Origin validation** → any web page can open a socket to the server (Cross-Site WebSocket
   Hijacking / unauthorized clients). The `Origin` header is browser-enforced and cannot be spoofed
   from a browser context, so checking it is an effective, cheap control.

**Impact:** closes two denial-of-service / hijacking vectors with a tiny, well-understood change.

## Definition of Done & Acceptance Criteria
- [ ] `WebSocketServer` is created with a sane `maxPayload` (e.g. 256 KB — large enough for the biggest
      legitimate client message, far below memory-pressure size).
- [ ] A `verifyClient` (or `upgrade` handler) accepts connections only from an allowlist of origins
      (configurable via `ALLOWED_ORIGINS` env; default permits localhost + the active tunnel host, and
      permits no-Origin non-browser clients for tooling/tests).
- [ ] Rejected upgrades return 401/403 and are logged; accepted behavior is unchanged for legit clients.
- [ ] A pure helper encapsulates the origin decision and is unit-tested.
- [ ] `npm run agent:check` green; `node src/server.js` boots; a normal client still connects.

## Implementation Approach
- Add a new pure module `src/net/originPolicy.js` exporting `isAllowedOrigin(origin, options)` (allowlist
  match; treat missing Origin as allowed for non-browser tools; case-insensitive host compare). Keep it
  faction-of-config-agnostic and side-effect free.
- In `src/server.js`, build `const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",")…`
  plus localhost defaults, and pass `new WebSocketServer({ server, maxPayload: 256*1024, verifyClient:
  (info) => isAllowedOrigin(info.origin, { allow: ALLOWED_ORIGINS }) })`.
- Do not change the message protocol or handlers.

## Test Strategy
- **Unit (`src/net/originPolicy.test.js`):** allows configured origins (any case), rejects unknown
  origins, allows missing Origin (tooling), respects an empty/′*′ allowlist policy. Deterministic.
- **Regression/manual:** boot the server; confirm the browser client at `http://localhost:8080` still
  connects (same-origin) and that `npm run agent:check` stays green.
