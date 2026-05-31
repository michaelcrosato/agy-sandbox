# SPEC-081 — Outlaw Spaceports & Black Market Contraband Pricing

## Description
Smuggling is an integral part of Starfall (P2/P3), but currently, selling contraband at major faction worlds is subject to standard price scaling and police scans. This specification implements dedicated **Black Market Services** at outlaw planets (like "Rogue's Hollow" in the Pirates faction) where players can sell contraband with a high price premium, but must maintain at least neutral standing with the underworld faction to dock.

1. **Black Market Service Flag:**
   - Extend the planet config to support `services.blackMarket: true`.
   - Update `Rogue's Hollow` in `src/engine/GameInstance.js` to have `services: { repair: true, refuel: true, blackMarket: true }`.

2. **Underworld Docking Permissions:**
   - In `src/server.js`'s `"land"` message handler, if `targetPlanet.services && targetPlanet.services.blackMarket` is true, check the player's reputation with the planet's faction.
   - If their standing is negative (`standing < 0`), refuse docking with a notification: `"Access Denied — Underworld Hostility: Pirate faction requires at least neutral standing."`.

3. **Black Market Pricing:**
   - In `src/engine/Trading.js` (or within portHandlers), when selling `"contraband"` at a planet with `services.blackMarket === true`, apply a +50% premium modifier (1.5x of base price) before other standing modifiers.

## Definition of Done (DoD)
- [ ] Configure `Rogue's Hollow` with `services.blackMarket = true` in `GameInstance.js`.
- [ ] Enforce standing checks in `src/server.js` preventing landing at black market ports when `standing < 0`.
- [ ] Implement the 1.5x price multiplier for selling contraband at black markets in `Trading.js`.
- [ ] Add integration and unit tests verifying the docking restrictions and the black market premium price calculations.
- [ ] Gate check `npm run agent:check` passes completely green.
