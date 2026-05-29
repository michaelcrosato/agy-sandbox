# 004 — ws outbound backpressure handling

- **Phase:** 0 · **Priority:** P0 (robustness) · **Blocked by:** none (pairs with 003)

## Description & Expected Impact
The 30Hz broadcast serializes once and blasts the string to every client, ignoring each socket's send
buffer. A slow/stalled client makes `ws` buffer outgoing frames without bound → server memory grows
until OOM (one bad client degrades everyone). **Impact:** bounds per-client memory and isolates slow
clients, protecting the whole room.

## Definition of Done & Acceptance Criteria
- [ ] Before/within the per-client send, check `client.ws.bufferedAmount`; if it exceeds a threshold
      (e.g. 1 MB), skip non-keyframe sends to that client (it will resync on the next keyframe) or, beyond
      a hard ceiling, `terminate()` it as unrecoverably slow.
- [ ] The high-frequency state broadcast still serializes once per tick (perf invariant preserved).
- [ ] The skip/disconnect decision is a pure, unit-tested helper.
- [ ] No regression to normal clients; `npm run agent:check` green; `node src/server.js` boots.

## Implementation Approach
- Add `src/net/backpressure.js` exporting `sendDecision(bufferedAmount, { isKeyframe, softLimit,
  hardLimit })` → `"send" | "skip" | "drop"`. Pure.
- In `src/server.js` broadcast loop, consult the helper per client using `client.ws.bufferedAmount` and
  the frame's keyframe flag (the `BroadcastFramer` already exposes keyframe vs delta). On `"drop"`,
  terminate + cleanup (reuse 003's path). Keep the single per-tick `JSON.stringify`.
- Because skipping a delta can desync a client, rely on the existing keyframe self-heal: mark the client
  `needsKeyframe` so the next frame to it is a full snapshot.

## Test Strategy
- **Unit (`src/net/backpressure.test.js`):** below soft limit → send; above soft limit + delta → skip;
  above soft limit + keyframe → send; above hard limit → drop; boundary values. Deterministic.
- **Manual:** boot + connect a normal client, confirm smooth play and a green gate.
