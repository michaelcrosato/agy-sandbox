# SPEC-087 — Dynamic Trade Profit Metric in AI Perception

- **Status:** Todo
- **Wave:** v19 — Phase 0
- **Priority:** High
- **Product Pillar:** P5 — Goal-Driven NPCs (Dynamic perception spread scoring)

## Problem

Currently, `buildPerception.js` populates the merchant AI's `tradeProfit` perception metric with a hardcoded static value of `0.6`. This prevents merchant NPCs from dynamically reacting to real economic shifts (such as dynamic market economic events, faction pricing discounts, or local shortages), leading to static trading patterns.

## Scope

### In

- **Authoritative Price Spreads:** Write a utility helper in `src/engine/Trading.js` (or inline inside `buildPerception.js`) calculating the maximum profit spread between docked ports in the active sector.
- **Standings Integration:** The spread calculations must factor in the NPC ship's faction registry standing (applying buy discounts or sales taxes based on their faction standing registry values).
- **Seeded AI Perception Routing:** Feed this dynamic normalized spread value (scaled between `0.0` and `1.0` based on the market maximum commodity margin) directly into `buildPerception`'s `tradeProfit` perception property.
- **Dynamic Trade FSM Reactivity:** Verify that the merchant NPC AI changes its docking target dynamically when a sector price event (e.g., famine or harvest boom) modifies sector prices.

### Out

- **Dynamic cross-sector trade planning:** NPCs continue trading in their active sector or jumping gates based on sector lists; full pathfinding across 30+ sectors is out-of-scope.

## Acceptance Criteria

- [ ] `buildPerception` calculates dynamic price spreads across base markets in the sector.
- [ ] Spread scores are normalized and update `tradeProfit` on perception updates.
- [ ] Merchant NPCs dynamically pick ports representing the highest actual trading profit margin.
- [ ] Green unit and integration test coverage validating price spread calculation and FSM reactions.

## Verification Commands

```bash
npm test -- src/engine/ai/buildPerception.test.js
npm run agent:check
```
