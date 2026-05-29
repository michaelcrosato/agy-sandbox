# 006 — Economy NaN self-heal + heartbeat diffusion guard

- **Phase:** 0 · **Priority:** P0 · **Blocked by:** none

## Description & Expected Impact
Follow-up to `tickets/TICKET003`. The root-cause NaN introduction in `EconomyManager.normalizePrices`
is already fixed (it skips a non-finite baseline). Two residual hardening items remain for a server that
runs forever: (1) `normalizePrices` does not **self-heal** a price that is already non-finite, and (2)
`GalaxyHeartbeat.pulse` diffusion/equilibrium math does not guard against a non-finite operand, so a
bad value (from a cross-version restore or future bug) could still spread across trade lanes.
**Impact:** the galaxy economy becomes provably self-correcting and cannot be permanently corrupted.

## Definition of Done & Acceptance Criteria
- [ ] In `normalizePrices`, when `baseline` is finite but `current` is **not**, snap `current = baseline`
      (self-heal) and log/count it; behavior for finite values is unchanged.
- [ ] In `GalaxyHeartbeat.pulse`, skip or clamp any commodity whose `current` or a neighbor's value is
      non-finite, so diffusion can never read/produce NaN.
- [ ] Regression tests cover both: an injected non-finite price recovers on the next normalize pulse, and
      a non-finite neighbor cannot poison diffusion output.
- [ ] `npm run agent:check` green.

## Implementation Approach
- `src/engine/EconomyManager.js`: in the `normalizePrices` loop, after the existing
  `if (!Number.isFinite(baseline)) continue;`, add `if (!Number.isFinite(current)) { p.market[item] =
  baseline; planetChanged = true; continue; }`.
- `src/engine/GalaxyHeartbeat.js`: in `pulse`, guard the neighbor-average accumulation
  (`if (!Number.isFinite(nb.market[commodity])) continue;`) and the final `target`/`next` computation
  (only write when `Number.isFinite(next)`).
- Keep changes minimal and additive; do not alter the normal-path arithmetic.

## Test Strategy
- **Unit (`EconomyManager.test.js`):** set a market price to `NaN`, run `normalizePrices`, assert it
  becomes the baseline (finite). 
- **Unit (`GalaxyHeartbeat.test.js`):** seed a neighbor commodity to `NaN`, pulse, assert every resulting
  price is finite and the healthy systems still diffuse normally. Deterministic (no Math.random).
