# SPEC-056 — Hyperspace Warp Lane Interdiction

## Description
To enhance tactical navigation and security patrol encounters, this spec introduces **Warp Lane Interdiction** gravity fields.

1. High-end capital ships, naval interceptors, or specialized outfitting modules ("Hyperdrive Interdictor Matrix") project a spherical interdiction field (radius e.g., 300 units).
2. If a player or NPC ship enters a warp gate or engages a stargate warp jump while inside an active, hostile interdiction field, the warp drive fails: `"WARP ENGINE DISRUPTED: Interdiction Gravity Well Active"`.
3. If a ship is in transit (trans-sector warp) and crosses path with a dynamic interdictor sector, the ship is dragged out of hyperjump into local space, initiating an immediate tactical encounter.
4. AI Patrol escorts and pirate bosses will utilize active interdictors to prevent players with high cargo value or illegal contraband from immediately warping away.

## Definition of Done (DoD)
- [ ] Add the `"Hyperdrive Interdictor Matrix"` (type: `"interdictor"`, mass: 350, cost: 8500) to `src/engine/outfitCatalog.js`.
- [ ] Update `src/engine/Hyperdrive.js` jump validation to verify if any hostile entity in the sector has an active interdictor module within 300 units, blocking warp jumps on true.
- [ ] Implement interdictor projection state on NPC warships and specialized security patrols in `src/engine/ai/AIController.js`.
- [ ] Render a subtle, pulsing cyan gravitational distortion circle around active interdicting ships on the canvas in `src/client/CanvasRenderer.js`.
- [ ] Write integration/unit tests verifying interdiction fields successfully prevent stargate hyperlane jumps and block warp triggers.
- [ ] Maintain a 100% green `npm run agent:check` gate.

## Implementation Approach
- In `src/engine/Hyperdrive.js`, query all entities in sector. If `ent.type === "ship" && ent.hasActiveInterdictor() && ent.position.distance(player.position) <= 300`, return `canJump = false`.
- Hook interdiction status checks in `server.js` `warp_jump` handler and respond with a clear disruption alert payload if blocked.
- Update `CanvasRenderer.js` in the ship drawing method to paint a pulsing ring if `ship.isInterdicting` is true.

## Test Strategy
- Add unit tests in `src/engine/Hyperdrive.test.js` or `src/engine/ai/AIController.test.js` confirming:
  - An active interdictor prevents a nearby ship from passing stargate hyperdrive validation.
  - Friendly interdiction fields (e.g. from allied ships or escorts) do NOT block warp jumps.
  - Interdictor outfits register mass correctly.
