# SPEC-039 — Tractor Outfit Mass Correction

## Description
Currently, `Outfitting.applyOutfitStats` only adds an outfit's `mass` for a matched stat type. The stat-less `tractor` type (Tractor Beam Matrix, 200 kg) no longer contributes hull mass when purchased or salvaged. This was an incidental behavior change when spec `007` extracted the inline `outfit_buy` switch. Both buy and salvage are currently consistent (both skip it), but all outfits should contribute to ship mass correctly.

This spec fixes the bug by ensuring that `applyOutfitStats` includes the outfit mass unconditionally for all outfits (or specifically supports `tractor`), making mass calculation correct and consistent.

## Definition of Done (DoD)
- [ ] `applyOutfitStats` in `src/engine/Outfitting.js` correctly applies mass for the `tractor` outfit type.
- [ ] Unit tests in `src/engine/Outfitting.test.js` verify that applying a `tractor` outfit increases the ship's total mass correctly by 200 kg.
- [ ] Full CI verification gate (`npm run agent:check`) is completely green.

## Implementation Approach
- Edit `src/engine/Outfitting.js`:
  - Locate the `applyOutfitStats` function.
  - Ensure that the mass of any outfit, including the `tractor` outfit type, is correctly accounted for in the ship's mass delta.
- Edit `src/engine/Outfitting.test.js`:
  - Add a unit test that creates a ship, applies a "Tractor Beam Matrix" (which is of type "tractor" with mass 200), and asserts that the ship's total mass has increased by exactly 200.

## Test Strategy
- Run targeted unit tests:
  `npm test -- src/engine/Outfitting.test.js`
- Verify the global gate:
  `npm run agent:check`
