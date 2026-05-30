# SPEC-063 — Dynamic Cosmic Storms & Wandering Anomalies

## Description
This spec introduces dynamic, server-authoritative wandering cosmic storm hazards that drift through the galaxy sectors over time, impacting both physical ship subsystems (energy drain, slow shield decay, sensor jamming) and client-side HUD visual elements.

1. **Storm Registry & Physics:** Create a `CosmicStorm` entity or zone config in `src/engine/CosmicStorm.js` that has a position, radius, velocity, drift angle, and hazard type (e.g., `"emp_storm"`, `"radioactive_cloud"`).
2. **Authoritative Drifting:** In the `GalaxyHeartbeat` pulse loop (or sector update loops), dynamically update storm positions so they drift slowly across space.
3. **Subsystem Damage & Jamming:**
   - `"emp_storm"`: slowly drains ship energy reserves (e.g., `-15 units/sec`) and increases weapon cooldown delay.
   - `"radioactive_cloud"`: deals slow, direct armor decay if shields are depleted (e.g., `-5 armor/sec`), bypasses standard shield absorption, and jams sensors (so the ship's sensor range in `buildPerception` is reduced by 50%).
4. **Client Render:** Visualizing the drifting cloud or pulsing hazard ring on the 2D Canvas in a custom, beautiful transparent color matching the hazard type.

## Definition of Done (DoD)
- [ ] Implement `src/engine/CosmicStorm.js` with structured data, pure drift updates, and area-of-effect checks.
- [ ] Integrate cosmic storms into `GameInstance.js` initialization and the server authoritative update loop.
- [ ] Wire physical storm effects (energy drain, sensor range damping, armor decay) to active ships within range.
- [ ] Add visual canvas rendering of drifting storms on the client side in `CanvasRenderer.js`.
- [ ] Write deterministic Jest unit and integration tests covering storm drift, ship area checks, energy depletion, and sensor range reduction.

## Implementation Approach
- Storm drift must be pure and deterministic inside the physics/engine layers.
- Sensor range reduction must hook cleanly into `buildPerception` via perception options.
- The default single-player and multiplayer room setups should seed 1-2 wandering storms.

## Test Strategy
- Unit tests in `src/engine/CosmicStorm.test.js` validating position progression over delta times.
- Integration tests in `src/engine/CosmicStorm.integration.test.js` verifying that a ship located inside an active EMP storm loses energy and is subject to sensor range reduction.
