# TICKET013 — EW2: Boarding & plunder of disabled ships

- **Status:** DONE (2026-05-28)
- **Priority:** P1

## Goal
Give the disable-before-destroy mechanic a payoff: board a disabled ship at low speed to plunder its
cargo + credits (hostiles) or repair it (friendlies).

## Context
`Ship.isDisabled` exists (armor floored to 30 standby) but disabling a ship is currently a dead end.
A `boarding_action` server message handler exists. Endless Sky's board-to-plunder/repair loop is the
natural payoff and pairs with EW1 (ship value) and smuggling.

## Scope
- **In:** pure `engine/Boarding.js` (`canBoard`, `plunder`, `boardRepair`); wire the `boarding_action`
  handler to it.
- **Out:** Ship **capture** (boarded ship joins your fleet) — separate, larger ticket; faction logic
  lives in the caller (module stays faction-agnostic).

## Likely files
- `src/engine/Boarding.js` (+ `.test.js`) — new
- `src/server.js` (`boarding_action` handler)

## Steps
1. `canBoard(boarder, target, opts)`: target `isDisabled`, boarder within `boardRange` and below
   `maxBoardSpeed`, not self.
2. `plunder(boarder, target, opts)`: refuse if `!canBoard` or `target.looted`; move cargo into the
   boarder's free hold, transfer `plunderCreditFraction` of target credits, set `target.looted`.
3. `boardRepair(boarder, target, opts)`: restore target armor to max + clear `isDisabled`; no loot.
4. Wire `boarding_action` to call plunder (hostile) or boardRepair (friendly), notify + `sendStats`.

## Acceptance criteria
- [x] `canBoard` requires a disabled target, proximity, and low boarder speed.
- [x] `plunder` respects the boarder's cargo capacity and transfers credits once (idempotent via `looted`).
- [x] `boardRepair` restores armor, clears `isDisabled`, and grants no cargo/credits.
- [x] `npm run agent:check` green (32 suites / 561 tests); server boots.

## Notes (resolution)
The `boarding_action` handler's plunder now routes through `Boarding.plunder` (preserving its 250u
range via options) so it also steals credits and is idempotent; added a `repair` action wired to
`boardRepair`. Salvage branch untouched. The module stays faction-agnostic; client/caller picks
plunder vs repair.

## Commands
```bash
npm test -- src/engine/Boarding.test.js
npm run agent:check
```

## Risks
- Cargo transfer must respect the boarder's free capacity; partial fills when the hold is nearly full.

## Notes
Module is faction-agnostic — the server decides plunder vs. repair from disposition.
