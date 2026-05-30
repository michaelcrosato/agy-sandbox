# SPEC-061 — Dynamic Planetary Stock Caravans & Cargo Convoy AI

## Description
This spec implements physical cargo transport fleets (caravans) flying across sector warp gates to transport goods between producers and consumers. This physically binds the Emergent Economy (P2), updating planetary market stock levels upon caravan arrival and departure.

1. Implement a specialized `AIController` caravan fleet behavior: caravans spawn at a producer planet (e.g. Polaris mining hub), purchase and load dynamic stock of `ore` (subtracting it from the planet's market inventory), fly across stargates, land at a consuming planet (e.g., Sigma Draconis), and sell/unload `ore` (adding it to the planet's market inventory).
2. Integrate caravan routes: caravans plan routes dynamically using `SECTOR_ADJACENCY` and autopilot trajectories.
3. Wire inventory shifts: physical market stock shifts must update dynamically in real time and sync to all active sector clients via `"market_sync"` events.
4. Add robust unit and integration tests asserting caravan route planning, flight execution, docking actions, and planetary market inventory mutations.

## Definition of Done (DoD)
- [ ] Implement caravan autopilot and dock/trade states in `AIController.js`.
- [ ] Hook caravan trading steps to modify planet market inventory quantities directly.
- [ ] Add visual caravan indicators on client render layers or canvas overlays.
- [ ] Write integration tests in `ProductionModel.test.js` and `ai.test.js` validating caravan lifecycle.

## Implementation Approach
- Use pure engine physics to model caravan autopilot trajectories.
- Enforce strict clamps on stock adjustments to prevent negative commodity quantities.
