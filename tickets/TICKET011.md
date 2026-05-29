# TICKET011 — EW7: Content expansion (5th weapon archetype + hull)

- **Status:** DONE (2026-05-28) — FLAK + Interceptor landed; commodity & EW3/EW9 outfits deferred
- **Priority:** P2

## Goal
Add genre variety cheaply via data: a 5th weapon archetype (FLAK point-defense) and a new hull
(Interceptor), each guarded by the existing table-invariant tests.

## Context
EW7 in `docs/ai/FEATURE_PLAN.md` is a set of mini-slices. This one does the two lowest-ripple,
self-contained additions. A new **commodity** ripples across `Ship.cargo`, all 8 `BASE_MARKETS`,
`Planet.market` defaults, and `ProductionModel` (plus the "six-commodity" test), and the Mining
Laser / Ramscoop / Fuel Cells outfits are load-bearing only with EW9/EW3 — so those are deferred to
their own slices.

## Scope
- **In:** FLAK archetype (enum + order + profile); Interceptor hull in the default shipyard; update the
  two pinned tests (archetype order, shipyard length).
- **Out:** New commodity (separate slice); Mining Laser/Ramscoop/Fuel Cells (with EW9/EW3).

## Likely files
- `src/engine/WeaponArchetypes.js` (+ `.test.js`)
- `src/engine/Planet.js` (+ `Planet.test.js`)

## Steps
1. Add `FLAK` to `WeaponArchetype`, `WEAPON_ARCHETYPE_ORDER`, and `WEAPON_ARCHETYPE_PROFILES` (rapid,
   short-range, low-damage, no pierce, cheap, low heat). Keep MISSILE strictly highest
   damage/pierce and BEAM strictly highest heat (invariants).
2. Add the `Interceptor` hull to the default shipyard.
3. Update `WeaponArchetypes.test.js` order assertion + a FLAK identity test; bump `Planet.test.js`
   shipyard length 6 → 7.

## Acceptance criteria
- [x] FLAK present in enum/order/profiles with all finite fields; superlative invariants still hold.
- [x] Interceptor available in the default shipyard.
- [x] `applyArchetypeToShip(ship, "FLAK")` scales stats generically (covered by existing test).
- [x] `npm run agent:check` green (30 suites / 540 tests).

Deferred (own slices): new commodity (ripples across all markets + the six-commodity test);
Mining Laser (EW9), Ramscoop + Fuel Cells (EW3).

## Commands
```bash
npm test -- src/engine/WeaponArchetypes.test.js src/engine/Planet.test.js
npm run agent:check
```

## Risks
- Two pinned tests (archetype order, shipyard length) must be updated in lockstep with the additions.

## Notes
FLAK profile: damage 0.5, speed 1.4, range 0.5, cooldown 0.4, pierce 0, energy 4, heat 4 — a rapid
point-defense weapon that stays under MISSILE (damage/pierce) and BEAM (heat).
