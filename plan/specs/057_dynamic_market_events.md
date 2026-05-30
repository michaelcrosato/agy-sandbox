# SPEC-057 — Dynamic Market Events & Sector Economy Shocks

## Description
To make the living galaxy simulation feel responsive and highly dynamic, this spec introduces **dynamic market events and economy shocks** that periodically trigger sector-wide price modifications, resource constraints, and active merchant routing adjustments.

1. Create a `GalaxyEventsManager` module that periodically schedules random but deterministic system events (e.g., "Famine", "Asteroid Harvest Boom", "Pirate Blockade", "Technological Breakthrough").
2. Dynamic events apply custom price modifiers to specific categories of commodities (e.g., Famine multiplies Food price by 3.0x, Pirate Blockade increases weapon/ore prices by 2.0x and limits supply).
3. Notify all active players in the sector using an elegant broadcast socket message type `"galaxy_event_announcement"`.
4. Render a pulsing, stylized system ticker banner at the top of the HUD UI, detailing the active event, active modifiers, and time remaining.
5. Ensure merchant AIs adapt their pathfinding/trading goals to exploit these dynamic price spreads (e.g., trading merchants favor shipping high-demand goods to afflicted worlds).

## Definition of Done (DoD)
- [ ] Implement `GalaxyEventsManager` in `src/engine/GalaxyEventsManager.js` with deterministic, seeded options.
- [ ] Connect event pricing modifiers to `Trading.js` price calculations.
- [ ] Wire periodic event scheduling to the server heartbeats and broadcast announcements to clients.
- [ ] Build the visual system ticker banner UI component on the HUD client layout.
- [ ] Write rigorous unit/integration tests confirming event lifecycle, correct price adjustments, and path-adaptation.

## Implementation Approach
- In `src/engine/Trading.js`, extend `getPrice()` to evaluate the active sector's event modifiers before returning final purchase/sale prices.
- In `src/server.js`, hook the `GalaxyEventsManager` into the `galaxyTicker` economics pulse.
- In `src/client/UIController.js`, handle incoming event socket broadcasts and trigger visual UI overlays.
