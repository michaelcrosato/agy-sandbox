/**
 * interest.js — pure area-of-interest (AOI) filtering for the P7 world-state
 * broadcast (spec 014).
 *
 * The authoritative server frames one snapshot/delta per client; this module
 * decides WHICH entities belong in a given client's frame: only those within a
 * radius of the client's viewpoint, plus a set of always-relevant ids (the
 * client's own ship and any caller-supplied globally-relevant entities such as
 * a combat target). Culling distant entities makes per-client bandwidth scale
 * with what a player can actually see rather than with the whole room — the
 * single biggest lever for higher entity/player counts.
 *
 * Pure: no DOM, sockets, timers, or randomness — deterministic and testable.
 * Entities entering/leaving the returned set across ticks become natural
 * add/remove deltas downstream (StateCodec.diff), so nothing lingers client-side.
 */

/**
 * Default AOI radius in world units. Chosen well beyond weapon/sensor range
 * (~400–800) so an entity is visible long before it can interact.
 */
export const DEFAULT_INTEREST_RADIUS = 3000;

/**
 * Returns the subset of `entities` within `radius` of the `viewer`, always
 * keeping any entity whose id equals `alwaysIncludeId` (the viewer's own ship)
 * or appears in `alwaysIncludeIds`. Input order is preserved; the input array
 * is not mutated. An invalid viewer yields a copy of the full list (fail-open,
 * so a not-yet-spawned client never silently goes dark).
 *
 * @param {Array<Object>} entities - Serialized entities, each with numeric `x`/`y` and an `id`.
 * @param {{x:number, y:number}} viewer - The viewpoint (typically the client ship's position).
 * @param {Object} [options]
 * @param {number} [options.radius=DEFAULT_INTEREST_RADIUS] - Inclusion radius.
 * @param {string|number} [options.alwaysIncludeId] - An id always kept (the viewer's ship).
 * @param {Set<*>|Array<*>} [options.alwaysIncludeIds] - Additional ids always kept.
 * @param {Map<string, Array<Object>>} [options.spatialGrid] - Optional pre-built spatial grid map.
 * @returns {Array<Object>} The in-interest subset.
 */
export function interestFilter(entities, viewer, options = {}) {
  if (!Array.isArray(entities)) return [];
  if (!viewer || !Number.isFinite(viewer.x) || !Number.isFinite(viewer.y)) {
    return entities.slice();
  }
  const radius = Number.isFinite(options.radius)
    ? options.radius
    : DEFAULT_INTEREST_RADIUS;
  const r2 = radius * radius;
  const alwaysId = options.alwaysIncludeId;
  const alwaysSet =
    options.alwaysIncludeIds instanceof Set
      ? options.alwaysIncludeIds
      : Array.isArray(options.alwaysIncludeIds)
        ? new Set(options.alwaysIncludeIds)
        : null;

  // Fallback to simple scan for tiny array sizes to avoid grid building overhead
  if (entities.length < 15) {
    const out = [];
    for (const ent of entities) {
      if (!ent) continue;
      if (
        (alwaysId !== undefined && ent.id === alwaysId) ||
        (alwaysSet && alwaysSet.has(ent.id))
      ) {
        out.push(ent);
        continue;
      }
      const dx = (Number.isFinite(ent.x) ? ent.x : 0) - viewer.x;
      const dy = (Number.isFinite(ent.y) ? ent.y : 0) - viewer.y;
      if (dx * dx + dy * dy <= r2) out.push(ent);
    }
    return out;
  }

  // 1. Segment space using a 2D spatial grid (bucket hash) with cell size = radius
  const cellSize = radius;
  const grid = options.spatialGrid || buildSpatialGrid(entities, cellSize);

  // 2. Query viewer cell plus its 8 neighbors
  const vcx = Math.floor(viewer.x / cellSize);
  const vcy = Math.floor(viewer.y / cellSize);
  const visibleIds = new Set();

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cellKey = `${vcx + dx}_${vcy + dy}`;
      const bucket = grid.get(cellKey);
      if (!bucket) continue;

      for (const ent of bucket) {
        const ex = Number.isFinite(ent.x) ? ent.x : 0;
        const ey = Number.isFinite(ent.y) ? ent.y : 0;
        const dist2 =
          (ex - viewer.x) * (ex - viewer.x) + (ey - viewer.y) * (ey - viewer.y);
        if (dist2 <= r2) {
          visibleIds.add(ent.id);
        }
      }
    }
  }

  // 3. Filter the original array to preserve exact ordering
  const out = [];
  for (const ent of entities) {
    if (!ent) continue;
    if (
      (alwaysId !== undefined && ent.id === alwaysId) ||
      (alwaysSet && alwaysSet.has(ent.id)) ||
      visibleIds.has(ent.id)
    ) {
      out.push(ent);
    }
  }
  return out;
}

/**
 * Builds a 2D spatial grid (bucket hash) from a list of entities.
 * @param {Array<Object>} entities - List of entities.
 * @param {number} cellSize - Segmentation cell dimension.
 * @returns {Map<string, Array<Object>>} Spatial cell mapping.
 */
export function buildSpatialGrid(entities, cellSize) {
  const grid = new Map();
  if (!Array.isArray(entities)) return grid;

  for (const ent of entities) {
    if (!ent) continue;
    const ex = Number.isFinite(ent.x) ? ent.x : 0;
    const ey = Number.isFinite(ent.y) ? ent.y : 0;
    const cx = Math.floor(ex / cellSize);
    const cy = Math.floor(ey / cellSize);
    const cellKey = `${cx}_${cy}`;

    let bucket = grid.get(cellKey);
    if (!bucket) {
      bucket = [];
      grid.set(cellKey, bucket);
    }
    bucket.push(ent);
  }
  return grid;
}
