# 018 — Production chains + `ore` commodity (P2)

- **Phase:** 2 · **Priority:** P2 (GOAL P2) · **Blocked by:** none (large ripple — sequence carefully)

## Description & Expected Impact
The economy has producer/consumer pulses but **no multi-stage chains** (raw → refined → manufactured),
and there is no raw `ore` commodity (mining yields `minerals` directly). **Impact:** deepens the emergent
economy toward the GOAL P2 DoD — a supply shock in one stage propagates to dependents — and gives mining
(`EW9`) a raw input that refines into `minerals`. This is the deferred EW7 "new commodity" slice.

## Definition of Done & Acceptance Criteria
- [ ] A new commodity (`ore`) is added **consistently** across `Ship.cargo` defaults, `Planet.market`
      defaults, **all 8 `BASE_MARKETS`**, and `ProductionModel` profiles; the "six-commodity" assertions
      in `Planet.test.js`/`EconomyManager.test.js` are updated to the new set.
- [ ] `ProductionModel` models a chain: mining hubs produce `ore`; industrial worlds consume `ore` and
      produce `minerals`/`machinery` — a simulated `ore` shock measurably shifts downstream prices over N
      pulses (tested).
- [ ] `EW9` mining can yield `ore` (config), refinable at industrial planets; persistence round-trips the
      new commodity.
- [ ] All existing market/serializer/heartbeat tests updated and green; `npm run agent:check` green.

## Implementation Approach
- Treat the commodity addition as a single atomic, wide edit: grep every commodity list
  (`food/electronics/minerals/luxuries/contraband/machinery`) and extend it. Update table-invariant tests
  in lockstep (this is why it's its own spec — the ripple is the risk).
- Extend `ProductionModel.PLANET_PROFILES` with `ore` produce/consume edges; add a chain-propagation test
  to `ProductionModel.test.js` (producer surplus → neighbor/consumer effect over pulses).
- Keep `GalaxyHeartbeat` math unchanged; only the data/profiles grow.

## Test Strategy
- **Unit:** table invariants (every planet's `BASE_MARKETS` has `ore`; `Ship.cargo` includes it;
  profiles reference valid commodities). Chain test: seed an `ore` surplus, pulse N times, assert
  downstream `minerals`/`machinery` prices move in the expected direction (deterministic — no random).
- **Regression:** full suite + persistence round-trip of a market containing `ore`.

## Notes
High ripple — do **after** Phase 0/1 are green so a wide diff isn't competing with churn. Consider a
helper constant `COMMODITIES` to centralize the list and prevent future drift.
