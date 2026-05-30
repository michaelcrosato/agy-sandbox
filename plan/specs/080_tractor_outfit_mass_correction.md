# SPEC-080 — Tractor Outfit Mass Correction

## Description
This specification corrects an incidental behavior change where the stat-less `tractor` outfit type (Tractor Beam Matrix, 200 kg) no longer contributes hull mass to the ship upon buy or salvage. In `src/engine/Outfitting.js`, `applyOutfitStats` only runs the mass-addition block if `applied` is set to true (which only happens for matched outfit stat types). Adding `case "tractor":` inside the outfit switch ensures it counts as an applied outfit stats handler and correct mass is factored into starship hull computations.

1. **Mass Correction:**
   - In `src/engine/Outfitting.js`, inside the switch statement in `applyOutfitStats`, add `case "tractor":` next to other equipment categories.
   - This sets `applied = true` and guarantees that the outfit's mass is added to the ship's total mass dynamically.

2. **Verification and Testing:**
   - Add a unit test to `src/engine/Outfitting.test.js` verifying that when a `tractor` outfit is applied to a ship, the ship's mass increases correctly by the outfit's configured mass.

## Definition of Done (DoD)
- [ ] Add `case "tractor":` to `applyOutfitStats` in `src/engine/Outfitting.js`.
- [ ] Add unit tests in `src/engine/Outfitting.test.js` verifying that applying the Tractor Beam Matrix outfit correctly increases the ship's mass by 200 kg.
- [ ] Gate check `npm run agent:check` passes completely green.
