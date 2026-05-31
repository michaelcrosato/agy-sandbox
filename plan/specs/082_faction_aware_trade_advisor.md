# SPEC-082 — Faction-Aware Trade Advisor & HUD Panel

## Description
This specification introduces a legibly deep helper (P2/P8) to calculate the most profitable trade routes inside the current sector room, factoring in the player's custom faction standing price modifiers and transaction taxes. It surfaces this data directly to the player in a gold-themed HUD overlay panel, allowing them to optimize their space merchant runs.

1. **Trade Route Advisor Calculation Engine:**
   - In `src/engine/Trading.js`, implement `findBestTradeRoutes(planets, factionRegistry, playerId)`:
     - Cross-compare all planets in the active sector.
     - For every commodity, calculate player's buy price at origin planet (factoring in standings price modifiers).
     - Calculate player's sell price at destination planet (factoring in standings price modifiers and transaction tax deductions).
     - Compute net profit: `netSellPrice - buyPrice`.
     - Return the top 3 routes sorted by profit descending.

2. **Cockpit HUD Overlay:**
   - Add `#trade-advisor-panel` in `index.html` styled with a modern, glassmorphic dark-gold design.
   - Update `src/client/UIController.js` to render the top trade routes dynamically onto the HUD.
   - Ensure the UI logic is completely exception-safe if no routes are available.

## Definition of Done (DoD)
- [ ] Implement the `findBestTradeRoutes` algorithm in `src/engine/Trading.js`.
- [ ] Add `#trade-advisor-panel` DOM structure to `index.html` and style in `index.css`.
- [ ] Update `src/client/UIController.js` to periodically display the trade advisor recommendations.
- [ ] Write unit tests verifying that route calculations accurately reflect standings discounts, docking taxes, and correct commodity margins.
- [ ] Gate check `npm run agent:check` passes completely green.
