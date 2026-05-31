# SPEC-164: Faction War Strategy Engine & Real-Time Conflict Zone Map REST API

## Summary

Design and implement a pure, headless `FactionWarCampaign.js` engine inside `src/engine/` that simulates tick-by-tick dynamic faction conflicts across the Sol/Vega/Nebula sectors, tracks planetary military fleet strengths, generates localized blockades and skirmishes, and exposes a robust, JSDoc-annotated REST API route `GET /api/faction/campaign` returning sector control matrices, military balances, and campaign histories.

## Motivation

- Elevates emergent universe depth (P3, P4) by simulating macro-level faction warfare independent of active pilots.
- Hardens the target architecture constraints by keeping strategy calculations strictly headless, pure, and 100% unit-tested.
- Provides dynamic, authentic backend campaign telemetry that can be queried by sharded cluster workers and visualized on the client HUD.

## Scope

**In:**

- Create pure class `src/engine/FactionWarCampaign.js` tracking military power, active sector sieges, caravan blockades, and battle history logs.
- Integrate faction standing shifts and combat outcomes to dynamically allocate military assets to losing sectors.
- Expose REST endpoint handler route `/api/faction/campaign` inside `src/server/restHandlers.js` to serialize campaign state with robust CORS support.
- Fully cover the strategic engine and REST endpoint with comprehensive Jest unit and integration tests inside `src/engine/FactionWarCampaign.test.js`.

**Out:**

- Do not construct graphical interfaces or SVG maps in this specification; only focus on the backend simulation engine, serialization protocols, and REST query routes.

## Approach

1. **Campaign Engine:**
   - Define a pure data model representing faction military power ratios (Empire vs Rebellion vs Syndicate).
   - Advance conflict ticks during regular heartbeat cycles, simulating random skirmishes or tactical retreats.
   - Adjust sector influence levels based on skirmish outcomes, triggering global Galactic Chronicle alerts on dynamic faction conquests.

2. **REST Integration:**
   - Add GET `/api/faction/campaign` to the modular `src/server/restHandlers.js` dispatcher.
   - Return static JSON containing active battlegrounds, military power bars, and recent conflict history logs.

3. **Test Strategy:**
   - Headless unit tests validating campaign state ticks, asset re-allocations, and serialization safety.
   - HTTP mock integration tests verifying that REST endpoints return correct CORS preflights and serialized JSON.

## Acceptance Criteria

- [ ] `FactionWarCampaign` class compiles and manages multi-sector military power distributions.
- [ ] Skirmishes and dynamic territory conquests are advanced tick-by-tick on heartbeats and logged.
- [ ] `/api/faction/campaign` endpoint is modularly exposed and returns valid serialized campaign matrices.
- [ ] Comprehensive unit and REST integration Jest tests are completely green.
