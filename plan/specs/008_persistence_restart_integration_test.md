# 008 — Persistence kill→restart→rejoin integration test

- **Phase:** 1 · **Priority:** P1 (test shortfall) · **Blocked by:** none

## Description & Expected Impact
Units for `Store`, `serializers`, and `PersistenceManager` exist, but there is no end-to-end test that
ages a galaxy, persists it through a real `JsonFileStore`, and restores it into a fresh instance the way
the live server does on restart. **Impact:** locks in the P1 "the world moved" showcase as a
CI-reproducible guarantee and guards the exact code path that produced the `006` NaN bug. Supersedes
`tickets/TICKET004`.

## Definition of Done & Acceptance Criteria
- [ ] A deterministic Jest test ages a `GameInstance` (mutate markets + N `galaxyHeartbeat` pulses) and a
      player (credits/cargo/outfits/ledger), saves via a temp-dir `JsonFileStore`, then loads into a
      **fresh** `PersistenceManager`/`GameInstance` and asserts per-planet markets + player state match.
- [ ] Player combat ledger (kills/combatValue/combatRating), passengerCapacity, ramscoopRate, and
      miningYieldMultiplier round-trip (they are in `PLAYER_HULL_FIELDS`).
- [ ] Temp dir wiped in `afterEach`; never writes to `./data`; `gameInstance.destroy()` in `finally`.
- [ ] `npm run agent:check` green.

## Implementation Approach
- New `src/persistence/restart.integration.test.js` reusing `GameInstance`, `JsonFileStore`,
  `PersistenceManager`, and the serializers. Use `os.tmpdir()` + `fs.mkdtemp`.
- Drive explicit `saveGalaxy`/`savePlayer` then `loadGalaxy→applyGalaxy` / `loadPlayer→applyPlayer`
  (don't rely on the autosave timer for determinism).

## Test Strategy
- This **is** the test (integration). Determinism: explicit pulse counts, no `Math.random` in
  assertions. Assert deep market equality across instances and field-by-field player equality.
- Guard against timer leaks (`destroy()` both instances) so Jest reports no open handles.
