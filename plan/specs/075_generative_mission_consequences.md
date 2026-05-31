# SPEC-075 — Generative Mission Server Consequence Pipeline

## Description
This specification connects the pure generative mission outcomes (from `MissionManager.completeGeneratedMission` or landing handlers) to the live authoritative `FactionRegistry` and planetary market price and stock levels in `src/server.js`, fully completing the generative mission consequence loop (P4).

1. **Server Consequence Dispatcher:**
   - In `src/server.js` (inside `port_land` or spaceport landing handlers), intercept successful courier, passenger, smuggling, and bounty mission arrivals.
   - Dispatch their corresponding `factionChanges` and `commodityChanges` (from mission consequences) directly to the authoritative `FactionRegistry` and local planet markets.

2. **Client Announcement Broadcasts:**
   - Broadcast a public lobby or sector websocket announcement (e.g., "Player [name] successfully delivered industrial cargo to sector-omega, lowering machinery prices!") whenever a high-impact generative mission completes.

## Definition of Done (DoD)
- [ ] Connect `completeGeneratedMission` consequence arrays to the server-side port landing handlers.
- [ ] Ensure completing trade/smuggling missions mutates local commodity stock counts and prices on the target planet.
- [ ] Add integration tests in `src/engine/faction.integration.test.js` or `src/server/portHandlers.test.js` verifying that completing courier/smuggling board missions adjusts player standings and changes local commodity inventories.
- [ ] Gate check `npm run agent:check` passes completely green.

## Implementation Approach
- Update the server landing handler to call the consequence appliers from `MissionManager` and update the planetary markets.
- Broadcast an announcement channel socket event to connected clients.

## Test Strategy
- Assert that completing an ore-delivery board mission updates the target planet's ore stock level and shifts local pricing accordingly.
