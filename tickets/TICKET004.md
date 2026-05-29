# TICKET004 — Persistence kill→restart→rejoin integration test

- **Status:** DONE (2026-05-28) — completed via `plan/specs/008`
- **Priority:** P2 (medium)

## Goal
Prove the P1 "the world moved" showcase from CI: age a galaxy, persist it, then restore it into a
fresh instance and confirm a returning player lands in the world they left.

## Context
`docs/LOG.md` iter-0012's "Next" calls for this. Unit tests cover `Store`, `serializers`, and
`PersistenceManager` in isolation, but there's no end-to-end test that exercises
`saveGalaxy/loadGalaxy + applyGalaxy` together with `savePlayer/loadPlayer + applyPlayer` through a
real `JsonFileStore` round-trip, the way the live server does on restart.

## Scope
- **In:** A new deterministic Jest integration test against a temp-dir `JsonFileStore`.
- **Out:** Standing up a real WebSocket server in tests; touching `src/server.js`.

## Likely files
- `src/persistence/PersistenceManager.test.js` (extend) or a new `src/persistence/restart.integration.test.js`
- Reuses `GameInstance`, `JsonFileStore`, `PersistenceManager`, serializers.

## Steps
1. Build `GameInstance` A; mutate a market and pulse `galaxyHeartbeat` N times; build a player with
   credits/cargo/outfits.
2. `PersistenceManager.saveGalaxy("public", A)` and `savePlayer(token, player, "public")` to an
   `os.tmpdir()` `JsonFileStore`.
3. Construct a **fresh** `PersistenceManager` (new store, same dir); `loadGalaxy`→`applyGalaxy` onto a
   fresh `GameInstance` B; `loadPlayer`→`applyPlayer` onto a fresh player.
4. Assert B's per-planet markets equal A's aged markets and the player's credits/cargo/outfits match.
5. Clean the temp dir in `afterEach`; never write to `./data`.

## Acceptance criteria
- [ ] Test ages markets, persists to a real file store, and restores them into a new instance equal to the original.
- [ ] Player state (credits, cargo, outfits, hull, mission progress) round-trips.
- [ ] Deterministic (seeded/explicit pulses, no `Math.random` in assertions); `afterEach` wipes the temp dir.
- [ ] `npm run agent:check` green.

## Commands
```bash
npm test -- src/persistence
npm run agent:check
```

## Risks
- Timer leaks: call `gameInstance.destroy()` in `finally` so heartbeat/respawn timers don't keep Jest open.

## Notes
Set `AUTOSAVE_INTERVAL_MS` small only if you exercise autosave; prefer explicit `saveGalaxy` calls for determinism.
