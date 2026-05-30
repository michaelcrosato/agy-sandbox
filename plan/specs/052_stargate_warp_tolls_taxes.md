# SPEC-052 — Stargate Warp Tolls & Port Transaction Taxes

## Description
To deepen the P3 reputation economy and add strategic weight to player standings, this spec introduces stargate warp tolls and port commercial transaction taxes.

When a player warp-jumps through a stargate governed by a major faction ("Federation", "Frontier League", "Pirates") or completes a commercial transaction (buying/selling commodities, outfitting, hulls) at their ports, they are charged a fee:
1. **Stargate Warp Tolls:** Players are charged a baseline 150 CR toll per jump.
2. **Docking/Trade Taxes:** A baseline 5% tariff is applied to all commodity trade sales and purchase values.
3. **Standings Scaling:** 
   - **Allied/Friendly (+50 to +100 standing):** 100% toll waiver (free travel) and tax reduction to 0%.
   - **Neutral (-15 to +49 standing):** Standard 150 CR toll and 5% tax.
   - **Hostile (-100 to -16 standing):** Standard toll is increased to 500 CR (or jump permission is denied if credits are insufficient), and trade tax is raised to 15% tariff.

## Definition of Done (DoD)
- [ ] Implement star system/gate governing faction identification based on nearby sector planets.
- [ ] Apply dynamic credit deduction on stargate warp jumps based on governing faction and player reputation.
- [ ] Apply dynamic sales and docking tax tariffs on buying/selling commodities and hulls at faction ports.
- [ ] Integrate full reputation-based discount and surcharge scaling for warp jumps and port transactions.
- [ ] Add integration tests in `src/engine/faction.integration.test.js` or `src/engine/Hyperdrive.test.js` validating correct tolls and tariffs applied for friendly, neutral, and hostile standings.
- [ ] Verify `npm run agent:check` remains 100% green.

## Implementation Approach
- In `src/engine/Hyperdrive.js` `validateWarpJump(ship, gate, cost)`, extend the check to calculate standing-based credit tolls:
  - Find the room's governing faction.
  - Calculate warp toll: `0` for friendly, `150` for neutral, `500` for hostile.
  - Assert that `ship.credits >= toll` (else block jump with a clear message: `"Insufficient credits for warp gate toll"`).
- In `src/engine/Trading.js` `tradeOne` / `applyHullPurchase`, factor in transaction taxes:
  - Neutral = standard price; Friendly = 15% discount (buys) / 10% premium (sells); Hostile = 20% surcharge (buys) / 20% discount (sells).
- Ensure all logic remains deterministic and fully testable.

## Test Strategy
- Write integration tests inside `src/engine/faction.integration.test.js` confirming:
  - Friendly players jump stargates for 0 cost and pay no port trade taxes.
  - Neutral players pay 150 CR warp gate tolls and 5% port taxes.
  - Hostile players pay 500 CR warp gate tolls and 15% trade tariffs.
