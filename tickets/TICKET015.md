# TICKET015 — Self-heal non-finite market values & guard heartbeat diffusion

- **Status:** OPEN
- **Priority:** P1 (high)

## Goal
Harden `EconomyManager` against dynamic NaN or non-finite values during market price normalization and global heartbeats.

## Context
If a commodity price decays or normalizes using unchecked float operations, or if a zero-value propagates, we risk NaN price-poisoning in `EconomyManager.normalizePrices`. While root-cause bugs were patched, we need an active self-healing layer that auto-corrects any existing non-finite prices back to baseline on load/tick, and safeguards price diffusion during the background heartbeat.

## Scope
- **In:**
  - Add self-healing checks inside `EconomyManager.normalizePrices` to automatically reset non-finite (NaN, Infinity, <= 0) values to standard baseline values.
  - Implement dynamic sanity guards in `GalaxyHeartbeat` diffusion steps to prevent any non-finite prices from propagating across sectors.
  - Write robust unit tests in `EconomyManager.test.js` and `GalaxyHeartbeat.test.js` asserting recovery from forced NaN/infinite inputs.
- **Out:**
  - Changing the base economic model parameters.
  - Adding persistent DB integrations.

## Likely files
- `src/engine/EconomyManager.js`
- `src/engine/EconomyManager.test.js`
- `src/engine/GalaxyHeartbeat.js`
- `src/engine/GalaxyHeartbeat.test.js`

## Steps
1. In `EconomyManager.js`, modify normalization calculations to check if current prices are finite. If not, self-heal by resetting them to base commodity values.
2. In `GalaxyHeartbeat.js`, verify prices before and after diffusion. Guard against propagating NaN/Infinity by enforcing minimum/maximum finite boundaries.
3. Add a test suite `test('guards against price-poisoning NaN values')` inside both test modules.
4. Execute `npm run agent:check` to ensure the gate is fully green.

## Acceptance criteria
- [ ] Non-finite prices are automatically self-healed back to their baseline.
- [ ] Global heartbeat price diffusion never propagates NaN or Infinity across trade lanes.
- [ ] Deterministic tests prove complete recovery from forced NaN, null, and non-finite values.
- [ ] `npm run agent:check` stays green.

## Commands
```bash
npm test -- src/engine/EconomyManager.test.js src/engine/GalaxyHeartbeat.test.js
npm run agent:check
```

## Risks
- Low. Self-healing guards only trigger on malformed data, preserving existing healthy market simulations.

## Notes
Ties back directly to the remaining Phase 4 "Bugs & tests" task.
