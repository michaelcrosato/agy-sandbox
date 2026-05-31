# SPEC-067 — Centralize Commodities & System Invariants

## Description
This specification centralizes the hardcoded commodity lists dispersed throughout the codebase into a single frozen `COMMODITIES` constant and utility helper (`makeEmptyCargo`) inside `src/engine/commodities.js`. It wires this centralized structure across ships, planets, and economies to prevent commodity drift and ensure structural integrity.

1. **Centralize Commodities:**
   - Ensure all zero-init cargo maps and priced market maps derive their keys from the frozen `COMMODITIES` array (containing `food`, `electronics`, `minerals`, `luxuries`, `contraband`, `machinery`, and `ore`).
   - Wire the utility helper `makeEmptyCargo` to build zero-initialized cargo structures across Ship constructor initialization, port transactions, and economic resets.

2. **Structural Integrity & Invariant Tests:**
   - Add a robust table-invariant regression test suite checking that every active economy market, ship inventory reset, and base market layout covers exactly the central commodity set with no missing or stray keys.

## Definition of Done (DoD)
- [ ] Export a frozen `COMMODITIES` array and a clean `makeEmptyCargo` function from `src/engine/commodities.js`.
- [ ] Import and integrate `COMMODITIES` / `makeEmptyCargo` inside `src/engine/Ship.js`, `src/engine/Trading.js`, and economic reset loops to prevent literal drift.
- [ ] Add a comprehensive unit test suite in `src/engine/commodities.test.js` asserting that the commodity list matches and that all `BASE_MARKETS` planet commodities are fully covered.
- [ ] Maintain 100% green gate coverage with zero warnings.

## Implementation Approach
- Use `src/engine/commodities.js` as the sole source of truth for raw commodities lists.
- Replace littering hardcoded maps with maps constructed dynamically using `COMMODITIES.reduce(...)`.

## Test Strategy
- Assert that `Ship.cargo` keys perfectly match `COMMODITIES`.
- Assert that `BASE_MARKETS` and all planet markets have keys matching `COMMODITIES`.
