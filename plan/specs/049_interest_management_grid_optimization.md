# SPEC-049 — Interest Management Grid Optimizations

## Description
In SPEC-014, we successfully implemented per-client **Interest Management** (AoI culling) inside `src/net/interest.js`. This prevents full-state broadcasts to every connected client and is the single most critical lever for netcode scaling (P7).

However, the current implementation of `interestFilter` uses a flat linear search of complexity $O(M \times N)$ (where $M$ is the number of connected clients/viewers and $N$ is the number of active space entities in the room). Under heavy multi-player load (e.g. 50 players and 200 projectiles/asteroids), this linear loop must evaluate 10,000 distance checks 30 times a second, consuming valuable server CPU and introducing tick lag.

This specification optimizes `interestFilter` by introducing a lightweight, pure **2D Spatial Grid / Bucket Hash** culling structure. By dividing the space into cells of size equal to the culling radius, a viewer only needs to evaluate entities residing in its current cell and the 8 neighboring cells. This collapses the query time to near $O(N + M)$ while preserving 100% behavioral equivalence and keeping the output array order identical.

## Definition of Done (DoD)
- [ ] Rework `interestFilter` in `src/net/interest.js` to utilize a 2D spatial grid indexing algorithm.
- [ ] The grid must segment space into cells of size equal to the active `radius` parameter.
- [ ] For each viewer, query only the viewer's occupied cell plus its 8 adjacent neighbor cells.
- [ ] Securely handle `alwaysIncludeId` and `alwaysIncludeIds` sets using fast $O(1)$ dictionary lookups to ensure the player's own ship and combat targets are unconditionally included.
- [ ] **Preserve Output Order**: Ensure the resulting array contains entities in their exact original input order, maintaining absolute, transparent behavioral drop-in equivalence.
- [ ] Add a comprehensive performance benchmark test suite in `src/net/interest.test.js` that:
  - Asserts that the grid-optimized filter returns exactly the same output elements in the same order as the legacy linear filter.
  - Benchmarks execution time under high entity counts (e.g., 1000 entities, 100 viewers) to verify a massive speedup (at least 3x - 10x faster).
- [ ] All 800+ Jest tests and linter checks remain completely green.

## Implementation Approach
- In `src/net/interest.js`, modify `interestFilter(entities, viewer, options)`:
  - If optimization is bypassed or `entities` is small (e.g. `< 10`), fallback safely to the simpler loop.
  - Otherwise, build the spatial grid map:
    - Choose cell size `C = radius`.
    - Map cell keys `cx_cy` (e.g. `"${Math.floor(x/C)}_${Math.floor(y/C)}"`) to lists of entities.
    - Collect a fast `id -> entity` lookup map to rapidly locate `alwaysIncludeId` and `alwaysIncludeIds`.
  - For the `viewer` at `(vx, vy)`:
    - Identify `vcx = Math.floor(vx/C)` and `vcy = Math.floor(vy/C)`.
    - Check cells `(vcx + dx, vcy + dy)` for `dx, dy` in `[-1, 0, 1]` (9 cells total).
    - Query candidates in these cells, running the standard distance check and collecting visible entity IDs in a `Set`.
    - Add `alwaysIncludeId` and `alwaysIncludeIds` to the visible `Set`.
    - Finally, filter the original `entities` array checking if `ent.id` is present in the visible `Set`. This elegantly guarantees the original array order is perfectly preserved.

## Test Strategy
- Update `src/net/interest.test.js` to add targeted tests:
  - Exact equivalence assertion between linear culling and grid-based culling.
  - Scalability benchmark verifying performance gains.
- Verify global verification:
  `npm run agent:check`
