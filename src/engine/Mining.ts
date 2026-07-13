/**
 * Mining (EW9) — pure, deterministic yield math for shattering asteroids.
 *
 * The asteroid→cargo-pod loop already lives in `GameInstance.handleEntityDestroyed`;
 * this module owns the "what + how much" decision so it can be unit-tested and a
 * Mining Laser can scale it. The caller supplies the RNG (`() => [0,1)`) so the
 * result is reproducible — no `Math.random` in here.
 */

/** Default mining tuning. Frozen; override per-call. */
export const DEFAULT_MINING_OPTIONS = Object.freeze({
  gemResource: "luxuries",
  oreResource: "ore",
  gemBaseMin: 2,
  gemBaseMax: 3,
  oreBaseMin: 1,
  oreBaseMax: 2,
  yieldMultiplier: 1, // raised by a Mining Laser
});

/**
 * Computes the resource and pod count yielded by shattering an asteroid.
 * @param {string} asteroidType - `"gem_asteroid"` yields the gem resource; anything
 *   else yields the ore resource.
 * @param {() => number} rng - Returns a number in [0, 1).
 * @param {Object} [options] - Partial override of {@link DEFAULT_MINING_OPTIONS}.
 * @returns {{resource: string, count: number}} Count is always >= 1.
 */
export function mineYield(asteroidType, rng, options = {}) {
  const o = { ...DEFAULT_MINING_OPTIONS, ...options };
  const isGem = asteroidType === "gem_asteroid";
  const resource = isGem ? o.gemResource : o.oreResource;
  const min = isGem ? o.gemBaseMin : o.oreBaseMin;
  const max = isGem ? o.gemBaseMax : o.oreBaseMax;
  const span = Math.max(0, max - min);

  const raw = typeof rng === "function" ? rng() : 0;
  const draw = Number.isFinite(raw)
    ? Math.min(0.999999999, Math.max(0, raw))
    : 0;
  const base = min + Math.floor(draw * (span + 1));

  const mult =
    Number.isFinite(o.yieldMultiplier) && o.yieldMultiplier > 0
      ? o.yieldMultiplier
      : 1;
  const count = Math.max(1, Math.round(base * mult));
  return { resource, count };
}
