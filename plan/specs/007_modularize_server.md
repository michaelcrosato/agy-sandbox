# 007 — Modularize server.js (extract tested units)

- **Phase:** 1 · **Priority:** P1 (structural debt) · **Blocked by:** none (eased after 002–004)

## Description & Expected Impact
`src/server.js` is a **2,054-line untested monolith** — the highest regression-risk surface in the repo
(sockets, rooms, 30Hz tick, persistence wiring, ~20 message handlers). Extract self-contained pure
logic into tested modules, leaving `server.js` a thin I/O orchestrator. **Impact:** real test coverage on
the riskiest seam, smaller blast radius for future changes, and faster comprehension. Supersedes
`tickets/TICKET005`.

## Definition of Done & Acceptance Criteria
- [ ] At least **3** pure units are extracted into `src/net/` or a new `src/server/` with full unit tests
      (candidates: message validation/dispatch table, the per-tick broadcast payload builder, the
      join/reconnect resolution, the room GC predicate).
- [ ] `server.js` imports them; **behavior is byte-identical** (server boots and serves unchanged).
- [ ] `server.js` LOC drops meaningfully; each extracted unit has deterministic tests.
- [ ] `npm run agent:check` green; `node src/server.js` boots and a client connects.

## Implementation Approach
- Read `server.js` by its lettered sections; pick the most self-contained pure logic first. One
  extraction per commit — keep moves mechanical, diff carefully.
- New modules stay pure (no socket/DOM/`Math.random` in test paths); the server passes state in and
  consumes the return. Mirror existing patterns (frozen options, `*.test.js` beside source).
- Do NOT change the wire protocol or handler semantics.

## Test Strategy
- **Unit:** each extracted module gets a deterministic suite (valid/invalid inputs, edge cases).
- **Regression:** full `npm run agent:check`; boot smoke
  `PORT=18182 PERSISTENCE_DIR=./data-tmp NODE_ENV=test node src/server.js` (then remove the tmp dir).
  Because the server isn't headlessly tested, verify by booting after each extraction.

## Notes
This is an enabler for `010` (observability) and `019` (scaling). Prefer many small extractions over one
big refactor; product-pillar features usually outrank it unless they require touching `server.js`.
