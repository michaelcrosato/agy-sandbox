# SPEC-051 — Collision Kinetic Damage & Shield Absorption

## Description
Currently, when two ships collide in space, they bounce off each other using simple elastic collision physics in `SpaceEngine.js`, but suffer zero structural damage. 

To raise the space simulation quality, this spec implements **kinetic collision impact damage**. When two ships collide at a high relative velocity:
1. We compute the relative velocity along the collision normal.
2. If this relative speed exceeds a minimum threshold (e.g. 50 units/s), kinetic damage is calculated as proportional to their relative momentum delta.
3. The collision damage is applied to both ships.
4. Active shields absorb the damage first; any remaining damage depletes the ship's armor.
5. Structural damage triggers hit-flash combat feedback.

## Definition of Done (DoD)
- [ ] Calculate kinetic collision damage inside the collision resolution phase (e.g., in `SpaceEngine.js` or `Ship.js` handler).
- [ ] Enforce a relative speed threshold of 50 units/s to prevent minor docking/maneuvering friction from causing damage.
- [ ] Apply damage proportionally based on relative momentum (using ship mass and speed).
- [ ] Allow active shields to absorb collision damage first, depleting armor only if shields are bypassed or depleted.
- [ ] Implement unit tests in `src/engine/Ship.test.js` or a new test file validating kinetic damage math and shield absorption behavior under variable relative speeds.
- [ ] Verify `npm run agent:check` remains 100% green.

## Implementation Approach
- In `src/engine/SpaceEngine.js`, locate the circle-collision resolution logic where positions and velocities are adjusted.
- Calculate the relative speed of the colliding entities along the collision normal:
  `const relVel = e1.velocity.subtract(e2.velocity); const normal = e2.position.subtract(e1.position).normalize(); const speedAlongNormal = relVel.dot(normal);`
- If `speedAlongNormal > 50`:
  - Compute kinetic damage: `const kineticDamage = Math.max(0, (speedAlongNormal - 50) * 0.15 * (e1.mass + e2.mass) / 1000);`
  - Safely apply damage to both entities if they have damage/shield properties:
    - If the entity is a ship, deduct from `shield`. If `shield` is depleted, deduct the excess from `armor`.
    - Set flags for UI flash/combat feedback.
- Make the damage multiplier and threshold easily configurable or mockable for testing.

## Test Strategy
- Write comprehensive tests asserting:
  - Collisions below 50 speed threshold deal 0 damage.
  - Collisions above threshold deal damage proportional to momentum.
  - Active shields correctly absorb the damage entirely when high enough.
  - Excess damage correctly rolls over to armor when shields are low.
