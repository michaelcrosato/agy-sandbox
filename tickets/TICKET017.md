# TICKET017 — Wire Faction Standings to Planetary Market Price Calculations

- **Status:** OPEN
- **Priority:** P2 (medium)

## Goal
Wire the pure standing policy systems into the live server-client port handlers, enabling a player's reputation with planetary factions to dynamically influence trade prices.

## Context
We have a pure `FactionRegistry` module that calculates reputation relationships, but faction standings are not fully integrated into planetary port trade handlers in `src/server.js` or `src/engine/GameInstance.js`. Friendly players should receive discounts, whereas hostile players should face severe price surcharges or docking bans.

## Scope
- **In:**
  - Retrieve the player's active faction reputation from `FactionRegistry` / `PersistenceManager` during a market query or transaction in the port handlers.
  - Modify commodity buying and selling prices on planets dynamically based on the player's standings (e.g. +20% price penalty for hostiles, -10% discount for allies).
  - Enforce complete locking (docking/trading ban) if faction reputation falls below a highly hostile threshold (e.g., -50).
  - Add comprehensive unit and integration tests under `src/engine/FactionRegistry.test.js` or `src/engine/faction.integration.test.js` validating reputational discounts/penalties.
- **Out:**
  - Creating new UI pages (re-use existing transaction modals in SpaceportUI).
  - Rewriting core price elasticity equations.

## Likely files
- `src/server.js`
- `src/engine/GameInstance.js`
- `src/engine/EconomyManager.js`
- `src/engine/faction.integration.test.js`

## Steps
1. Locate the dynamic transaction handlers inside `src/server.js` (specifically `trade_buy` and `trade_sell` ws message listeners).
2. Query the player's current reputation with the planet's governing faction.
3. Modify the transaction unit price using a pure pricing standing multiplier function.
4. If standing is extremely low (hostile), reject the transaction or dock command entirely.
5. Add targeted unit/integration tests confirming reputational pricing scales.
6. Verify the gate with `npm run agent:check`.

## Acceptance criteria
- [ ] Allied standing grants dynamic discounts on buy prices and/or premiums on sell prices.
- [ ] Hostile standing applies dynamic surcharges or rejects trades/docking.
- [ ] Complete pricing reputation multipliers are covered by deterministic tests.
- [ ] `npm run agent:check` passes cleanly.

## Commands
```bash
npm test -- src/engine/faction.integration.test.js
npm run agent:check
```

## Risks
- Multipliers must not result in zero or negative prices. Ensure minimum/maximum value clamps are enforced.

## Notes
Directly addresses the P3 Faction & Reputation Web requirements in `docs/GOAL.md`.
