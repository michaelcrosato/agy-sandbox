# 014 — Interest management (area-of-interest delta filtering)

- **Phase:** 2 · **Priority:** P2 (netcode / GOAL P7) · **Blocked by:** 015 recommended (binary protocol)

## Description & Expected Impact
The authoritative broadcast sends **every entity** to **every client** each tick (keyframe/delta over
the whole room). Market-leading netcode (Colyseus, Valve, Gambetta) uses **area-of-interest**: a client
only receives entities near it. **Impact:** bandwidth and client CPU scale with what a player can see,
not room size — the single biggest lever for higher entity/player counts (the GOAL P7 "50-entity room
with 8 clients at lower bandwidth" DoD).

## Definition of Done & Acceptance Criteria
- [ ] A pure `interestFilter(entities, viewer, options)` returns only entities within a radius/AOI of the
      viewer (always include the viewer's own ship + globally-relevant entities like the player's targets).
- [ ] The per-client frame is built from the filtered set; the keyframe/delta self-heal still works
      per-client (each client has its own last-snapshot baseline).
- [ ] Entities leaving/entering AOI produce correct add/remove deltas; no "ghost" entities linger client-side.
- [ ] A measured bandwidth reduction in a synthetic 50-entity / 8-viewer scenario vs. full-state (assert
      via the `010` metrics counter or a test harness).
- [ ] `npm run agent:check` green; `node src/server.js` boots; the client renders correctly near other ships.

## Implementation Approach
- New pure `src/net/interest.js`: `interestFilter(entities, viewer, { radius, alwaysInclude })` reusing
  the grid/distance math already in `SpaceEngine`. Deterministic.
- Broadcast now frames **per client** against that client's filtered set + per-client baseline (the
  current "serialize once for all" optimization is replaced by per-client framing — measure the tradeoff;
  consider grouping clients by region/cell to amortize).
- Client (`NetworkHandler`/`main.js`) must treat "entity no longer in delta" as "left my view" (remove),
  which the snapshot/delta consumer largely already does — verify dead-reckoning doesn't resurrect them.

## Test Strategy
- **Unit (`interest.test.js`):** filter includes near + alwaysInclude, excludes far; viewer always present;
  symmetric/boundary cases. Deterministic hand-built entities.
- **Integration:** replay a churn sequence through per-client framers + the `StateCodec` round-trip and
  assert each client reconstructs exactly its in-AOI set; assert bandwidth < full-state.
- **Manual:** boot + two clients; confirm each sees nearby ships and far ones cull cleanly.

## Notes
Pairs with `015` (binary) and `010` (metrics to prove the win). This is the highest-impact Phase 2 item.
