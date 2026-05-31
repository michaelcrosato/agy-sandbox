# SPEC-077 — raw ore refining port services and mining laser mass

## Description
This specification connects player-side raw ore refining at spaceports (P2). It adds support for players to refine carried raw `ore` commodities into `minerals` at planetary spaceports, enforcing specialized transaction tax rates. Additionally, it implements actual mass properties for the Mining Laser outfit to influence starship agility.

1. **Spaceport Refining Services:**
   - In `src/server/portHandlers.js`, implement `handleOreRefine` to convert player `ore` into `minerals` in their cargo bay (e.g. 2 tons of `ore` yields 1 ton of `minerals`, minus faction transaction taxes).
   - Wire WebSocket message handlers for `"ore_refine"` events.

2. **Mining Laser Mass:**
   - Ensure the Mining Laser outfit adds mass property to the player's ship, affecting agility calculations dynamically.

## Definition of Done (DoD)
- [ ] Implement `handleOreRefine` converting ore to minerals on command in `portHandlers.js`.
- [ ] Add unit tests verifying that raw ore refining correctly calculates output yields and handles cargo capacity limitations.
- [ ] Gate check `npm run agent:check` passes completely green.
