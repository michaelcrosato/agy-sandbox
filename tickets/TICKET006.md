# TICKET006 — EW1: Combat rating + ship bounty value + kill ledger

- **Status:** DONE (2026-05-28)
- **Priority:** P1 (foundation for EW2)

## Goal
Track what a pilot has destroyed: give every ship a credit-worth `bountyValue`, accrue kills + a
logarithmic combat rating on the attributed killer, and persist it.

## Context
`SpaceEngine` already attributes kills via `entity.destroyedBy`, and `GameInstance.handleEntityDestroyed`
resolves the `killerClient`, but nothing is recorded. Endless Sky rates pilots by the credit value of
ships they disable/destroy (logarithmic). This is the foundation EW2 (boarding/plunder) builds on.

## Scope
- **In:** pure `engine/CombatRating.js`; `Ship` fields (`bountyValue`, `kills`, `combatValue`,
  `combatRating`); persistence of the ledger; wire `recordKill` into `handleEntityDestroyed`; surface
  `combatRating`/`kills` in the server stats payload.
- **Out:** HUD rendering of the rating (client, follow-up); fleet-wide rating sharing; ship capture.

## Likely files
- `src/engine/CombatRating.js` (+ `.test.js`) — new
- `src/engine/Ship.js` (+ `Ship.test.js`)
- `src/persistence/serializers.js` (+ `serializers.test.js`)
- `src/engine/GameInstance.js` (+ `GameInstance.test.js`) — wiring
- `src/server.js` — `sendStats` payload

## Steps
1. `CombatRating.js`: `shipBountyValue(ship,opts)`, `combatRating(value,opts)` (log, monotonic),
   `combatRank(rating)`, `recordKill(killer,value)` (kills++, combatValue+=value, recompute rating).
2. `Ship`: add `bountyValue=null` param + init `kills=0/combatValue=0/combatRating=0`.
3. Persist `kills/combatValue/combatRating` via `PLAYER_HULL_FIELDS`.
4. Wire `recordKill(killerClient.ship, shipBountyValue(ent))` at the top of the ship-destroyed branch.
5. Add `kills`, `combatRating` to `sendStats`.

## Acceptance criteria
- [x] `combatRating` is monotonic non-decreasing and logarithmic (diminishing marginal gain).
- [x] `recordKill` increments kills and adds the victim's bounty value; null/zero-value safe.
- [x] `shipBountyValue` honors an explicit override and otherwise derives from hull stats.
- [x] Ledger round-trips through serialize/applyPlayer.
- [x] A simulated kill in `GameInstance` increments the killer ship's `kills`.
- [x] `npm run agent:check` green (28 suites / 514 tests).

## Commands
```bash
npm test -- src/engine/CombatRating.test.js
npm run agent:check
```

## Risks
- Low; additive. `handleEntityDestroyed`/`sendStats` edits are small; verify by booting the server.

## Notes
Keep `Ship` free of a `CombatRating` import (duck-typed `recordKill`) to avoid a cycle.
