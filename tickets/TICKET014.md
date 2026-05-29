# TICKET014 — EW9: Mining depth (seeded yields + Mining Laser)

- **Status:** DONE (2026-05-28)
- **Priority:** P3

## Goal
Make asteroid mining testable and a little deeper: extract the yield math into a pure seeded helper,
and add a Mining Laser outfit that boosts yield.

## Context
The asteroid→`CargoPod` loop already exists in `GameInstance.handleEntityDestroyed`, but the resource
and count are computed inline with `Math.random` (untestable) and flat (no upgrade path).

## Scope
- **In:** pure `engine/Mining.js` (`mineYield(asteroidType, rng, options)`); refactor the asteroid
  branch to use it; `Ship.miningYieldMultiplier` (persisted) raised by a Mining Laser outfit.
- **Out:** An `ore` raw commodity / refining chain (ties to a new commodity — deferred).

## Likely files
- `src/engine/Mining.js` (+ `.test.js`) — new
- `src/engine/GameInstance.js` (+ `GameInstance.test.js`), `src/engine/Ship.js`,
  `src/persistence/serializers.js`, `src/engine/Planet.js`, `src/server.js`

## Steps
1. `Mining.js`: `mineYield(asteroidType, rng, { yieldMultiplier })` → `{ resource, count }` (gem →
   luxuries 2–3, generic → minerals 1–2), deterministic given `rng`, multiplier scales count.
2. Refactor the asteroid branch to call `mineYield(ent.type, Math.random, { yieldMultiplier })` using
   the attributed miner's multiplier; keep the (cosmetic) pod scatter.
3. `Ship.miningYieldMultiplier` (default 1, persisted); Mining Laser outfit (type `miner`) + `outfit_buy`.

## Acceptance criteria
- [x] `mineYield` is deterministic per seed; gem→luxuries 2–3, generic→minerals 1–2.
- [x] A `yieldMultiplier > 1` increases the count; ≤0/non-finite treated as 1; count ≥ 1.
- [x] No `Math.random` inside `mineYield`.
- [x] Destroying a gem asteroid spawns luxuries pods (wiring test).
- [x] `npm run agent:check` green (33 suites / 569 tests); server boots.

## Commands
```bash
npm test -- src/engine/Mining.test.js src/engine/GameInstance.test.js
npm run agent:check
```

## Risks
- Refactor must preserve live behavior (random counts) — pass `Math.random` as the rng in the instance.

## Notes
Multiplier is applied from the miner attributed by `destroyedBy`, mirroring EW1's kill attribution.
