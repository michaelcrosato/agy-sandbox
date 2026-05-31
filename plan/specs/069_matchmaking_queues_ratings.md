# SPEC-069 — Matchmaking Room Queues, Ratings & Priority Filters

## Description
This specification upgrades the game's room matchmaking engine to segment players based on their Combat Rating (MMR) and prioritize high-quality matches. It implements a progressive threshold expansion queue where the acceptable rating delta widens over time if a player remains unmatched.

1. **Rating-Based Matching (MMR):**
   - Extend `src/server/matchmaking.js` to evaluate a player's `combatRating` alongside existing `mode` and `tags` filters.
   - When enqueuing, check if existing rooms have an average combat rating within a defined baseline tolerance delta (e.g., `+/- 20`).

2. **Progressive Tolerance Expansion Queue:**
   - Maintain a queue join timestamp for each player inside `JoinQueue`.
   - Implement dynamic tolerance widening: every few seconds (e.g., every 5 seconds spent in the queue), widen the acceptable MMR delta of the enqueued player by a set step (e.g., `+10` MMR tolerance), ensuring that players are eventually matched even during low-concurrency periods.

3. **Squad-Aware Matchmaking:**
   - Support group matchmaking where an entire squad can request a join, reserving multiple slots and using the squad's average combat rating to match.

## Definition of Done (DoD)
- [ ] Extend `matchRoom` in `src/server/matchmaking.js` to support combat rating-based matching with enqueued timestamps.
- [ ] Implement `updateQueueTolerances(now)` or a similar routine that dynamically increments individual search tolerances based on elapsed wait times.
- [ ] Add rigorous unit tests in `src/server/matchmaking.test.js` verifying that MMR differences filter rooms correctly, and that tolerance expands progressively over simulated time.
- [ ] Add an integration test in `src/server/matchmaking.integration.test.js` demonstrating progressive matching under live WS simulation.
- [ ] Gate passes fully green with zero warnings.

## Implementation Approach
- Add a `combatRating` property to enqueued player records and room metadata.
- Inside `matchRoom` and `JoinQueue.tick()`, check differences between enqueued player ratings and room averages, expanding tolerances dynamically.

## Test Strategy
- Assert that a player with `100` MMR is NOT matched into a room with `200` MMR initially.
- Assert that after simulating a wait of 10 seconds, the player's tolerance wident sufficiently and they successfully match into the `200` MMR room.
