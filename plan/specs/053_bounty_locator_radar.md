# SPEC-053 — Faction Bounty Locator Radar

## Description
Locating high-value target bosses or bounty marks in large sectors can sometimes be difficult. This spec introduces the **Bounty Locator Radar** outfit to the catalog.

When a player equips a "Bounty Locator Radar":
1. The client-side UI parses any active bounty targets in the sector.
2. The radar projects a directional visual bearing (e.g. dynamic arrow or compass heading indicator) and relative distance readout toward the target boss.
3. The radar updates at 10Hz/30Hz to give smooth tracking as ships maneuver.
4. If no bounty target is active in the current sector, the radar shows: `"No Active Bounty Targets in Sector"`.

## Definition of Done (DoD)
- [ ] Add the `"Bounty Locator Radar"` to the outfitting catalog (`src/engine/outfitCatalog.js`).
- [ ] Implement distance and vector calculations on the server/client to identify relative bearing to active bounty ships.
- [ ] Wire up client-side indicators inside `src/client/SpaceportUI.js` or `src/client/UIController.js` to render the tracking telemetry when the outfit is equipped.
- [ ] Write unit tests inside `src/engine/Outfitting.test.js` or `src/client/__tests__/UIController.test.js` verifying equipped radar correctly calculates correct distance/bearing to target.
- [ ] Verify `npm run agent:check` remains 100% green.

## Implementation Approach
- In `src/engine/outfitCatalog.js`, append:
  ```javascript
  {
    name: "Bounty Locator Radar",
    cost: 4000,
    type: "radar",
    value: 1,
    mass: 150,
    description: "Military-grade tracking system. Projects real-time directional bearing and range telemetry to bounty targets in-sector."
  }
  ```
- In `src/client/UIController.js` or `CanvasRenderer.js`, check if player's ship has the `"Bounty Locator Radar"` outfit equipped.
- Find any entity in the room where `ent.role === "boss"` or `ent.name === activeBountyTargetName`.
- Compute target vector: `const dir = target.position.subtract(player.position); const dist = dir.length();`.
- Draw a dynamic radar overlay on screen (e.g. an arrow pointing toward the target with range in kilometers/units).

## Test Strategy
- Write tests confirming:
  - Radar outfit successfully registers in catalog and applies ship stats.
  - Directional vector calculations to the active boss are correct (e.g. straight ahead, to the right, behind).
  - Telemetry output is null-safe when no bounty target exists in sector.
