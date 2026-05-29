/**
 * CombatRating (EW1) — pure, deterministic helpers for valuing ships and rating
 * pilots by the credit-worth of what they have destroyed.
 *
 * Inspired by the Endless Sky / Elite convention: a pilot's combat rating grows
 * with the cumulative value of ships they destroy, but **logarithmically** — each
 * additional kill of the same value is worth progressively less, so reaching the
 * next rank takes exponentially more destruction.
 *
 * No DOM, sockets, timers, or `Math.random` — every function is referentially
 * transparent given its inputs (`recordKill` mutates only the object passed to it).
 */

/** Tuning knobs for ship valuation and rating curve. Frozen; override per-call. */
export const DEFAULT_COMBAT_RATING_OPTIONS = Object.freeze({
  baseValue: 100, // floor worth of any ship, before stats
  shieldWeight: 1, // credits per point of max shield
  armorWeight: 2, // credits per point of max armor
  weaponWeight: 25, // credits per point of weapon damage
  ratingScale: 100, // rating points per base-10 decade of value
  ratingDivisor: 500, // value scale inside the log (softens low values)
});

/**
 * Estimates a ship's credit worth as a bounty / combat-rating contribution.
 * An explicit finite `ship.bountyValue` overrides the derived estimate.
 * @param {Object} ship - Ship-like with optional `bountyValue`, `maxShield`, `maxArmor`, `weaponDamage`.
 * @param {Object} [options] - Partial override of {@link DEFAULT_COMBAT_RATING_OPTIONS}.
 * @returns {number} Non-negative integer worth.
 */
export function shipBountyValue(ship, options = {}) {
  const o = { ...DEFAULT_COMBAT_RATING_OPTIONS, ...options };
  if (!ship) return 0;
  if (Number.isFinite(ship.bountyValue))
    return Math.max(0, Math.round(ship.bountyValue));
  const shield = Number.isFinite(ship.maxShield) ? ship.maxShield : 0;
  const armor = Number.isFinite(ship.maxArmor) ? ship.maxArmor : 0;
  const weapon = Number.isFinite(ship.weaponDamage) ? ship.weaponDamage : 0;
  const value =
    o.baseValue +
    shield * o.shieldWeight +
    armor * o.armorWeight +
    weapon * o.weaponWeight;
  return Math.max(0, Math.round(value));
}

/**
 * Maps cumulative destroyed-value to a logarithmic combat rating. Monotonic
 * non-decreasing in `combatValue`; returns 0 for non-positive / non-finite input.
 * @param {number} combatValue - Cumulative credit worth destroyed.
 * @param {Object} [options] - Partial override of {@link DEFAULT_COMBAT_RATING_OPTIONS}.
 * @returns {number} Integer rating (>= 0).
 */
export function combatRating(combatValue, options = {}) {
  const o = { ...DEFAULT_COMBAT_RATING_OPTIONS, ...options };
  if (!Number.isFinite(combatValue) || combatValue <= 0) return 0;
  return Math.round(
    o.ratingScale * Math.log10(1 + combatValue / o.ratingDivisor),
  );
}

/** Rating thresholds → human-readable rank. Ordered ascending. */
const COMBAT_RANKS = Object.freeze([
  Object.freeze({ min: 0, name: "Harmless" }),
  Object.freeze({ min: 50, name: "Mostly Harmless" }),
  Object.freeze({ min: 100, name: "Novice" }),
  Object.freeze({ min: 150, name: "Competent" }),
  Object.freeze({ min: 200, name: "Dangerous" }),
  Object.freeze({ min: 260, name: "Deadly" }),
  Object.freeze({ min: 320, name: "Elite" }),
]);

/**
 * Returns the human-readable rank label for a numeric rating.
 * @param {number} rating - A {@link combatRating} value.
 * @returns {string} Rank name (never empty); defaults to "Harmless".
 */
export function combatRank(rating) {
  const r = Number.isFinite(rating) ? rating : 0;
  let name = COMBAT_RANKS[0].name;
  for (const tier of COMBAT_RANKS) {
    if (r >= tier.min) name = tier.name;
  }
  return name;
}

/**
 * Records one kill on a killer ledger: increments the kill count, adds the
 * victim's worth to cumulative value, and recomputes the rating. Mutates and
 * returns the passed object. A null/undefined killer is a no-op.
 * @param {Object} killer - Object carrying `kills`, `combatValue`, `combatRating`.
 * @param {number} victimValue - The destroyed ship's {@link shipBountyValue}.
 * @param {Object} [options] - Partial override of {@link DEFAULT_COMBAT_RATING_OPTIONS}.
 * @returns {Object|null} The mutated killer, or `null` if none was given.
 */
export function recordKill(killer, victimValue, options = {}) {
  if (!killer) return null;
  const value =
    Number.isFinite(victimValue) && victimValue > 0 ? victimValue : 0;
  killer.kills = (Number.isFinite(killer.kills) ? killer.kills : 0) + 1;
  killer.combatValue =
    (Number.isFinite(killer.combatValue) ? killer.combatValue : 0) + value;
  killer.combatRating = combatRating(killer.combatValue, options);
  return killer;
}
