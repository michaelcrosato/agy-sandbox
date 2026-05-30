# 019f — Graceful drain / zero-downtime restart

- **Phase:** 2 (scale-out) · **Priority:** P2 (GOAL P7) · **Blocked by:** `019c`, `019e` (recommended) · **Parent:** `019`

## Description & Expected Impact
Deploys/restarts today drop every connection. The end state is **zero-downtime**: drain a worker by moving
its rooms to peers and letting clients reconnect. The client already has reconnect backoff + keyframe
re-sync. **Impact:** ship/restart without data loss or visible downtime — the operational ceiling-raiser.

## Definition of Done & Acceptance Criteria
- [ ] A drain routine: stop accepting new clients for the draining worker, **save each owned room's galaxy**,
      `transfer` ownership to a peer (via `019e` presence), and signal affected clients to reconnect (they
      land on the new owner and re-sync from a forced keyframe).
- [ ] An integration test drains node A mid-session and asserts node B serves the **same room state** with
      no data loss (galaxy + a player ledger survive the hand-off).
- [ ] Single-process mode is unaffected (drain is a no-op with one worker); `npm run agent:check` green.

## Implementation Approach
- A pure `planDrain(worker, registry)` → the set of `transfer` operations + save list; a thin executor that
  saves galaxies (existing `PersistenceManager`), performs the transfers, and emits a `reconnect`
  notification to affected clients. Reuse the existing forced-keyframe-on-rejoin path.

## Test Strategy
- **Unit:** `planDrain` produces the correct transfer/save set for a worker's rooms.
- **Integration:** drain A → B owns + restores galaxy + a persisted player; client reconnect path yields a
  keyframe and identical state (extends the `019`/`019e` multinode tests).
