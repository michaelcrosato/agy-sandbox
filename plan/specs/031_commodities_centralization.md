# 031 — Centralize the commodity list into a `COMMODITIES` constant

- **Phase:** 1 · **Priority:** P1 (drift prevention; BACKLOG from spec 018) · **Blocked by:** none

## Description & Expected Impact
Spec 018 added the 7th commodity `ore` by extending each hardcoded literal directly (`Ship.cargo`,
`Trading.applyHullPurchase` reset, `Planet` default market, the 8 `BASE_MARKETS`). The next commodity would
again touch every site — drift-prone. **Impact:** a single source of truth so adding/removing a commodity
is one edit, with a table-invariant test that fails loudly on drift.

## Definition of Done & Acceptance Criteria
- [ ] A single exported `COMMODITIES` list (the 7 names) is the source of truth (e.g.
      `src/engine/commodities.js`); the **zero-init** maps (`Ship.cargo`, `applyHullPurchase` reset) are
      **derived** from it (`COMMODITIES.reduce(...)`), not hand-written.
- [ ] A table-invariant test asserts every `BASE_MARKETS` planet entry **and** a fresh `Ship.cargo` cover
      exactly `COMMODITIES` (no missing/extra keys).
- [ ] Priced maps (per-planet markets, `Planet` defaults) keep their explicit per-commodity values but are
      validated against `COMMODITIES`. `npm run agent:check` green; no behaviour change.

## Implementation Approach
- New `commodities.js` exporting a frozen `COMMODITIES` array + a `makeEmptyCargo()` helper. Refactor
  `Ship` + `Trading` to use `makeEmptyCargo()`. Leave priced literals as data but add the invariant test.

## Test Strategy
- **Unit:** `makeEmptyCargo()` keys === `COMMODITIES`; every `BASE_MARKETS` entry's keys ⊇ `COMMODITIES`;
  `Planet` default market keys === `COMMODITIES`. **Regression:** existing market/cargo/serializer tests stay green.
