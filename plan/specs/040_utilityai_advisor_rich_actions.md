# SPEC-040 — UtilityAI Advisor Rollout & Rich Action Mapping

## Description
Currently, the `useUtilityAdvisor` flag is enabled only at `GameInstance` merchant, guard, and pirate spawns, and only the `FLEE` goal overrides the role FSM (with a simple evade action).

This specification expands the UtilityAI advisor to:
1. Enable `useUtilityAdvisor` on all remaining NPC spawns including raiders, storyline/bounty bosses, escorts, and single-player offline pilots.
2. Implement rich actions mapping to goals rather than falling through to the legacy FSM:
   - `REGROUP`: NPC retreats from threats, holds position in a safe zone, and pauses to recharge shield and energy before re-engaging.
   - `TRADE`: NPC merchants dynamically select profitable planets from local market spreads, travel to them, and land to execute trades.
   - `ENGAGE`: NPCs dynamically evaluate target weakness (low shields, low hull, high thermal buildup) rather than just engaging the nearest target.
3. Feed live market spreads and faction standings into `buildPerception`.

## Definition of Done (DoD)
- [ ] UtilityAI advisor is wired into all NPC spawn pathways in `src/server.js` and `src/main.js`.
- [ ] `REGROUP`, `TRADE`, and `ENGAGE` actions are fully implemented in `src/engine/ai/AIController.js` and pure decision trees in `src/engine/ai/buildPerception.js`.
- [ ] Faction relations are fed into perception so NPCs recognize hostile players.
- [ ] Deterministic unit tests are added in `src/engine/ai/AIController.advisor.test.js` verifying that:
  - An NPC in `REGROUP` retreats and waits to recharge.
  - A merchant in `TRADE` selects a profitable hub and navigates.
  - An attacker in `ENGAGE` targets the weaker ship instead of a closer, stronger ship.
- [ ] The global gate (`npm run agent:check`) is 100% green.

## Implementation Approach
- Edit `src/engine/ai/buildPerception.js`:
  - Enhance `buildPerception` to include local market prices (to calculate trade profit) and player faction standings (to identify threats).
- Edit `src/engine/ai/AIController.js`:
  - Map `Goals.REGROUP` to `executeRegroup` action.
  - Map `Goals.TRADE` to `executeTradeRoute` action.
  - Upgrade `executeEngage` to evaluate prey weaknesses.
- Edit `src/server.js` and `src/main.js`:
  - Ensure all spawned NPCs have `useUtilityAdvisor: true` set on their `AIController`.

## Test Strategy
- Run advisor test suite:
  `npm test -- src/engine/ai/AIController.advisor.test.js`
- Verify global verification:
  `npm run agent:check`
