# TICKET007 — EW6: Jettison cargo

- **Status:** DONE (2026-05-28)
- **Priority:** P2

## Goal
Let a pilot dump cargo into space (to flee a scan, free hold space, or stage a handoff), spawning a
scoopable cargo pod.

## Context
`Ship.removeCargo` exists and `GameInstance.handleEntityDestroyed` already spawns `CargoPod`s, but
there's no way to voluntarily eject cargo. Genre staple; pairs with smuggling and EW2 boarding.

## Scope
- **In:** pure `Ship.jettison(commodity, amount)`; deterministic `GameInstance.jettisonFromShip(ship,
  commodity, amount)` that spawns a pod; a `jettison` server message handler.
- **Out:** Client keybind/UI (not headlessly testable — thin follow-up); contraband-scan AI.

## Likely files
- `src/engine/Ship.js` (+ `Ship.test.js`)
- `src/engine/GameInstance.js` (+ `GameInstance.test.js`)
- `src/server.js`

## Steps
1. `Ship.jettison(commodity, amount)`: clamp to carried amount; return `{resourceType, amount}` or null.
2. `GameInstance.jettisonFromShip`: call `ship.jettison`; on success spawn a `CargoPod` just behind the
   ship inheriting its velocity (deterministic — no Math.random); add to engine; return the pod.
3. `server.js`: `jettison` handler → `room.jettisonFromShip(...)`, notification + `sendStats`.

## Acceptance criteria
- [x] `jettison` removes up to the carried amount and returns a correct pod spec; null on unknown/invalid.
- [x] Dumping more than carried ejects all of it; cargo weight drops.
- [x] `jettisonFromShip` spawns exactly one pod with matching resource/amount and adds it to the engine.
- [x] `npm run agent:check` green (28 suites / 519 tests); server boots.

## Commands
```bash
npm test -- src/engine/Ship.test.js src/engine/GameInstance.test.js
npm run agent:check
```

## Risks
- Low; additive. Deterministic pod velocity keeps the spawner unit-testable.

## Notes
Returning a spec (not spawning) from `Ship` keeps the engine entity-graph-free and pure.
