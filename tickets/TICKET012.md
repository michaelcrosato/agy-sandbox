# TICKET012 — EW3: Hyperdrive fuel economy

- **Status:** DONE (2026-05-28)
- **Priority:** P2

## Goal
Make hyperdrive fuel a real resource loop: jumps consume it (via a tested helper, not inline magic),
a Ramscoop outfit passively regenerates it so a pilot is never permanently stranded, and Fuel Cells
raise capacity. (Paid refuel already landed in EW5.)

## Context
The `warp_jump` server handler already deducts a hardcoded 20 `hyperFuel` and blocks under that — but
the logic is inline/untestable, there is no passive regen (a fuel-less pilot far from a port is
stuck), and no fuel-capacity outfit. `Ship.hyperFuel`/`maxHyperFuel` exist.

## Scope
- **In:** pure `engine/Hyperdrive.js` (canJump/consumeJump/refuel/ramscoopRegen); refactor `warp_jump`
  to use it (behavior-preserving, cost stays 20); `Ship.ramscoopRate` + passive regen in `Ship.update`
  (persisted); Ramscoop + Fuel Cells outfits + `outfit_buy` handling.
- **Out:** Variable per-route jump cost; fuel-burn telemetry.

## Likely files
- `src/engine/Hyperdrive.js` (+ `.test.js`) — new
- `src/engine/Ship.js` (+ `Ship.test.js`), `src/persistence/serializers.js`
- `src/engine/Planet.js`, `src/server.js`

## Steps
1. `Hyperdrive.js`: `DEFAULT_HYPERDRIVE_OPTIONS { jumpCost: 20, ramscoopRate: 0 }`; `canJump(ship,cost)`,
   `consumeJump(ship,cost)`, `refuel(ship,units)`, `ramscoopRegen(ship,dt,rate)` — all clamp to max.
2. `warp_jump`: replace the inline check/deduct with `canJump`/`consumeJump` (cost 20).
3. `Ship`: `ramscoopRate = 0`; in `update`, `ramscoopRegen(this, dt, this.ramscoopRate)`; persist field.
4. `Planet`: add `Ramscoop Collector` (type `ramscoop`, value = fuel/sec) and `Auxiliary Fuel Cells`
   (type `fuel`, value = +maxHyperFuel); handle both in `outfit_buy`.

## Acceptance criteria
- [x] `canJump` false under cost, true at/over; `consumeJump` deducts exactly and clamps ≥ 0.
- [x] `refuel`/`ramscoopRegen` add fuel and clamp to `maxHyperFuel`; no-ops on bad input.
- [x] A ship with `ramscoopRate > 0` regains fuel over `update` ticks (clamped); rate 0 ⇒ no change.
- [x] `warp_jump` still costs 20 (via `consumeJump`) and blocks when insufficient.
- [x] `npm run agent:check` green (31 suites / 552 tests); server boots.

## Commands
```bash
npm test -- src/engine/Hyperdrive.test.js src/engine/Ship.test.js
npm run agent:check
```

## Risks
- `warp_jump` refactor must stay behavior-identical (cost 20). Ship→Hyperdrive import is safe (Hyperdrive imports nothing).

## Notes
This also lands the EW7-deferred Ramscoop + Fuel Cells outfits, since they only matter with fuel economy.
