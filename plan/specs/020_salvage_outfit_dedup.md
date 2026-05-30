# 020 — Salvage outfit dedup (route through applyOutfitStats)

- **Wave:** A (continued hardening) · **Priority:** P1 · **Blocked by:** none

## Description & Expected Impact
Spec 007 extracted `engine/Outfitting.applyOutfitStats`, but only `outfit_buy` was routed through it.
The `boarding_action` **salvage** branch in `src/server.js` still inlines its own `defaultCatalog`
array and outfit-effect logic (a second copy of the catalogue/stat mapping). **Impact:** removes a
real source-of-truth duplication so outfit stats/mass can never drift between buying and salvaging.

## Definition of Done & Acceptance Criteria
- [ ] The salvage branch applies a salvaged outfit's stats via `applyOutfitStats` (no inline switch).
- [ ] The inline `defaultCatalog` duplicate is removed; the outfit catalogue has a single source (the
      `Planet` outfitter or a shared exported constant).
- [ ] Salvaging an outfit yields the same stat/mass result as buying it (verified by test).
- [ ] `npm run agent:check` green; `node src/server.js` boots.

## Implementation Approach
- Read the salvage branch (`grep "msg.action === \"salvage\""` in `src/server.js`). Replace its inline
  stat application with `applyOutfitStats(clientObj.ship, outfit)`.
- For the catalogue: prefer the landed planet's `outfitter` (already the source) or, if salvage needs a
  catalogue independent of a planet, export a shared `DEFAULT_OUTFITS` constant from `engine/Planet.js`
  (or a new `engine/outfitCatalog.js`) and use it in both places.
- Keep behaviour identical otherwise (notification, mass, dedupe-by-name).

## Test Strategy
- **Unit:** extend `Outfitting.test.js` if a new shared catalogue is added (every entry has a known
  `type` + positive `mass`). Add a parity test: `applyOutfitStats` on a catalogue entry equals the
  documented stat delta (already partly covered).
- **Regression:** `npm run agent:check`; boot smoke + (if possible) a salvage flow check.
