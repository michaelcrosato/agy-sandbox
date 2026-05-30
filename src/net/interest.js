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
