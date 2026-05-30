/**
 * commodities — the single source of truth for the tradeable commodity set
 * (spec 031).
 *
 * Before this module, the seven commodities were hand-listed in every cargo and
 * market literal (`Ship.cargo`, the hull-purchase reset, `Planet`'s default
 * market, the 8 `BASE_MARKETS`), so adding one (e.g. `ore` in spec 018) meant
 * touching every site — drift-prone. The **zero-init** cargo maps now derive
 * from `COMMODITIES`, and a table-invariant test asserts every market/cargo map
 * covers exactly this set, so the list can no longer silently drift.
 *
 * Priced maps (per-planet markets) keep their explicit per-commodity values —
 * only the *set of keys* is centralized here.
 */

/** The canonical, frozen commodity list (order is the historical wire order). */
export const COMMODITIES = Object.freeze([
  "food",
  "electronics",
  "minerals",
  "luxuries",
  "contraband",
  "machinery",
  "ore",
]);

/**
 * Builds a fresh, zero-initialized cargo map keyed by every commodity. A new
 * object is returned each call so ships never share a cargo reference.
 * @returns {Object<string, number>}
 */
export function makeEmptyCargo() {
  /** @type {Record<string, number>} */
  const cargo = {};
  for (const commodity of COMMODITIES) cargo[commodity] = 0;
  return cargo;
}
