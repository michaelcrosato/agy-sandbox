# TICKET008 — EW5: Port services (repair & refuel)

- **Status:** DONE (2026-05-28)
- **Priority:** P2

## Goal
Let a landed pilot pay to repair hull armor and top off hyperdrive fuel at a port.

## Context
Ports offer trade/outfit/shipyard but no repair or refuel, so battle damage is only undone by death
(respawn). Genre staple; refuel becomes load-bearing once EW3 (hyperdrive fuel) lands.

## Scope
- **In:** pure `engine/PortServices.js` (cost + apply for repair/refuel); `Planet.services` flags; a
  `port_service` server handler.
- **Out:** Partial (pay-what-you-can) repair/refuel — full-or-nothing here; shield repair (shields regen).

## Likely files
- `src/engine/PortServices.js` (+ `.test.js`) — new
- `src/engine/Planet.js` (+ `Planet.test.js`)
- `src/server.js`

## Steps
1. `PortServices.js`: `armorDeficit`/`fuelDeficit`, `repairCost`/`refuelCost` (∝ deficit), `applyRepair`/
   `applyRefuel` (full-or-nothing: charge + clamp to max; insufficient credits → no-op).
2. `Planet`: add `services = { repair: true, refuel: true }`.
3. `server.js`: `port_service` handler (`service: "repair"|"refuel"`), landed + planet-offers gating,
   notification + `sendStats`.

## Acceptance criteria
- [x] `repairCost`/`refuelCost` are proportional to the deficit and 0 when full.
- [x] `applyRepair`/`applyRefuel` restore to max, charge the cost, and clamp; return `{..., ok}`.
- [x] Insufficient credits is a no-op (no charge, no restore).
- [x] `Planet` exposes `services` flags.
- [x] `npm run agent:check` green (29 suites / 532 tests); server boots.

## Commands
```bash
npm test -- src/engine/PortServices.test.js
npm run agent:check
```

## Risks
- Low; additive pure module + thin handler.

## Notes
Repairs armor (persistent damage); shields/heat already self-recover. Full-or-nothing keeps the
"insufficient credits = no-op" acceptance unambiguous.
