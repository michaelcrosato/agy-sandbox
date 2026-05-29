# 003 — ws connection heartbeat / dead-socket reaper

- **Phase:** 0 · **Priority:** P0 (robustness) · **Blocked by:** none

## Description & Expected Impact
There is no ws-level ping/pong liveness check (the existing `type:"pong"` is a game-message handler, not
a transport heartbeat). Half-open TCP connections (client crashes, network drops) linger indefinitely,
leaking memory, file descriptors, and per-room client/fleet state, and keeping ghost ships in the world.
**Impact:** reclaims resources and removes ghost players; standard ws production hygiene.

## Definition of Done & Acceptance Criteria
- [ ] On each connection, `ws.isAlive = true`; a `pong` listener resets it to true.
- [ ] A single server interval (~30s, `unref`'d and cleared on shutdown) pings all sockets; any socket
      still `isAlive === false` from the previous round is `terminate()`d and runs the normal disconnect
      cleanup (same path as a client close).
- [ ] No new open-handle warnings in Jest; the interval is tracked and cleared in the existing shutdown.
- [ ] The reaping decision is a pure, unit-tested helper.
- [ ] `npm run agent:check` green; `node src/server.js` boots.

## Implementation Approach
- Add a pure helper `src/net/heartbeat.js` exporting `reapSockets(sockets, { now })` or a predicate
  `shouldTerminate(client)` that returns the list to terminate given each client's `isAlive` flag — pure,
  no timers, so it is testable; the server owns the `setInterval`.
- In `src/server.js`: set `ws.isAlive=true` on connection + `ws.on("pong", …)`; add a heartbeat interval
  that flips `isAlive=false` then `ping()`s, terminating any that didn't pong; route terminations through
  the existing disconnect-cleanup. Register the interval with the existing timer/shutdown tracking.
- Follow the existing autosave-interval pattern (`unref`, stored stop fn) for lifecycle parity.

## Test Strategy
- **Unit (`src/net/heartbeat.test.js`):** given fake clients with mixed `isAlive` flags, the helper
  selects exactly the dead ones; alive ones survive; empty/edge inputs safe. Deterministic.
- **Manual:** boot the server, confirm it stays up and that a normal client remains connected across a
  heartbeat cycle.
