# SPEC-041 — Player-Side Ore Refining at Ports

## Description
Currently, raw `ore` is mined from asteroids and can be sold to planets, and refined `ore` is processed into `minerals` and `machinery` behind the scenes via the planetary production chain heartbeats. However, the player has no manual way to refine raw `ore` they carry.

This specification introduces a new Port Service: **Refinery Services**. When docked at any industrial or mining planet (e.g., Polaris, Aurelia, Valkyrie, Sigma Draconis) that possesses refinery services, the player can manually refine their raw `ore` into valuable `minerals` or `machinery` for a processing fee, or under a yields multiplier based on the planet's standing/reputation discount.

## Definition of Done (DoD)
- [ ] Implement a pure `applyRefine` service function in `src/engine/PortServices.js` that consumes raw `ore` from a ship's cargo and produces `minerals` (or `machinery`) based on yields and fees.
- [ ] Connect the refinery service handler in `src/server.js` under the `"port_refine"` client message action.
- [ ] Support faction standing discount/multiplier on the refining processing fee.
- [ ] Add unit tests in `src/engine/PortServices.test.js` verifying the refining logic, fee deductions, and output cargo yields.
- [ ] Add integration tests in `src/engine/faction.integration.test.js` or a new test suite verifying that a docked player can execute a refine transaction, and standing correctly impacts the fee.
- [ ] Global verification gate `npm run agent:check` is completely green.

## Implementation Approach
- Edit `src/engine/PortServices.js`:
  - Add `applyRefine(ship, planet, quantity, FactionRegistry)` function.
  - Raw `ore` is converted to `minerals` (ratio e.g., 2:1).
  - Calculate base processing fee per unit refined, applying a discount/surcharge based on faction standing.
- Edit `src/server.js`:
  - Add client message dispatcher for `"port_refine"`.
  - Validate that the player is docked at a planet with refinery services and has enough credits/cargo.
- Edit `src/client/UIController.js` and `index.html` (or `src/client/SpaceportUI.js` if it exists):
  - Add dynamic refinery options/buttons to the spaceport interface allowing the player to trigger refining.

## Test Strategy
- Run PortServices tests:
  `npm test -- src/engine/PortServices.test.js`
- Verify global verification:
  `npm run agent:check`
