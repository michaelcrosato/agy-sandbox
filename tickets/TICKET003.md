# TICKET003 — Fix NaN price-poisoning; harden market self-heal

- **Status:** PARTIALLY DONE — root-cause fixed (2026-05-28); self-heal follow-up TODO
- **Priority:** P1 (high)

## Goal
Ensure the headless economy can never poison a market price with `NaN`, and can recover if a price
ever becomes non-finite — critical for a server designed to run forever.

## Context
`EconomyManager.normalizePrices()` drifted each market price toward `BASE_MARKETS[planet][commodity]`.
If a market held a commodity key absent from `BASE_MARKETS` (e.g. after a cross-version persistence
restore via `applyGalaxy`, which replaces a market wholesale), `baseline` was `undefined`, so
`baseline - current` → `NaN`, permanently corrupting that price. `GalaxyHeartbeat` then diffuses
prices along trade lanes, spreading the `NaN` to neighboring systems over pulses → galaxy-wide corruption.

## Scope
- **In (done):** guard `normalizePrices` against non-finite baselines + regression test.
- **In (follow-up):** optionally self-heal an already-non-finite `current` toward its finite baseline;
  guard `GalaxyHeartbeat.pulse()` diffusion/equilibrium math against non-finite operands.
- **Out:** Reworking the elasticity model; changing `BASE_MARKETS`.

## Likely files
- `src/engine/EconomyManager.js`, `src/engine/EconomyManager.test.js` (done)
- `src/engine/GalaxyHeartbeat.js`, `src/engine/GalaxyHeartbeat.test.js` (follow-up)

## Steps
1. (done) In `normalizePrices`, `if (!Number.isFinite(baseline)) continue;` before drifting.
2. (done) Add a test: a market key absent from `BASE_MARKETS` is left untouched, never `NaN`.
3. (todo) If `Number.isFinite(baseline) && !Number.isFinite(current)`, snap `current = baseline` (self-heal) + test.
4. (todo) In `GalaxyHeartbeat.pulse`, skip/clamp any commodity whose `current` or neighbor value is non-finite + test.

## Acceptance criteria
- [x] `normalizePrices` never writes `NaN`; unbaselined keys are left as-is.
- [x] Regression test proves the fix (suite green: 496 tests).
- [ ] A non-finite market value self-heals to baseline on the next normalize pulse (follow-up).
- [ ] `GalaxyHeartbeat` diffusion cannot propagate a non-finite value (follow-up).

## Commands
```bash
npm test -- src/engine/EconomyManager.test.js
npm run agent:check
```

## Risks
- Self-heal could mask an upstream bug that produced the bad value — log when it triggers so it stays visible.

## Notes
Pre-fix evidence: `(undefined - 500)` → `NaN`, `Math.sign(NaN)*… ` → `NaN`, `500 + NaN` → `NaN`.
Fix matches the existing `!== undefined` guard idiom in `GalaxyHeartbeat`.
