/**
 * ProductionModel: pure, deterministic data + logic for planetary production
 * and consumption pressures on commodity prices.
 *
 * Each planet has a profile describing the commodities it produces (which push
 * local price DOWN as supply outpaces demand) and consumes (which push local
 * price UP as demand outpaces supply). Each pulse, those pressures shift the
 * planet's market by a configurable fraction of baseline, bounded by a
 * [minFactor, maxFactor] band around baseline so a producer cannot drive a
 * commodity to zero nor a consumer to infinity.
 *
 * The module is pure: no timers, no sockets, no randomness. It is consumed by
 * `GalaxyHeartbeat` which applies one production step per pulse before the
 * existing lane-diffusion and equilibrium-drift passes.
 */

/**
 * Default producer/consumer profiles for the planets seeded by
 * `src/engine/GameInstance.js`. Strengths are unitless multipliers (typically
 * in `[0..1]`) that scale the per-pulse shift; commodities omitted from both
 * maps contribute no pressure. Profiles reflect each planet's flavor text:
 * agri worlds produce food, mining hubs produce minerals, industrial colonies
 * produce machinery/electronics, etc., and consume the inputs they need.
 */
export const PLANET_PROFILES = {
  Sol: {
    produces: { machinery: 1 },
    consumes: { luxuries: 1, food: 0.4 },
  },
  "Valkyrie Depot": {
    produces: { machinery: 1 },
    consumes: { electronics: 1, minerals: 0.5 },
  },
  "New Polaris": {
    produces: { minerals: 1 },
    consumes: { food: 1, machinery: 0.5 },
  },
  "Sigma Draconis": {
    produces: { electronics: 1 },
    consumes: { minerals: 1, food: 0.4 },
  },
  "Aurelia Mining Hub": {
    produces: { minerals: 1, machinery: 0.4 },
    consumes: { food: 1 },
  },
  "Kaelis Colony": {
    produces: { food: 1 },
    consumes: { electronics: 1, machinery: 0.4 },
  },
  "Tenebris Prime": {
    produces: { luxuries: 1 },
    consumes: { electronics: 1, food: 0.4 },
  },
  "Rogue's Hollow": {
    produces: { contraband: 1 },
    consumes: { food: 1, machinery: 0.4 },
  },
};

/**
 * Defaults that keep pressure gentle enough for diffusion to still matter, but
 * strong enough that a producer/consumer commodity provably trends over a few
 * pulses. A unit of producer strength shifts price down by `productionRate`
 * fractions of baseline per pulse; a unit of consumer strength shifts it up
 * by `consumptionRate` fractions per pulse. The result is clamped to
 * `[minFactor, maxFactor] * baseline`.
 */
export const DEFAULT_PRODUCTION_OPTIONS = Object.freeze({
  productionRate: 0.02,
  consumptionRate: 0.02,
  minFactor: 0.4,
  maxFactor: 2.5,
});

/**
 * Computes the next (unrounded) price for a single commodity given net
 * production/consumption pressure. Pure function — no side effects.
 *
 * @param {number} current - Current price.
 * @param {number} baseline - Baseline reference price (used for both step
 *   magnitude and clamping bounds).
 * @param {number} produceStrength - Producer strength (0+).
 * @param {number} consumeStrength - Consumer strength (0+).
 * @param {Object} options - Tuning. See `DEFAULT_PRODUCTION_OPTIONS`.
 * @returns {number} Next price, bounded by the configured factor band.
 */
export function computeCommodityPressure(
  current,
  baseline,
  produceStrength,
  consumeStrength,
  options,
) {
  const shift =
    baseline *
    (consumeStrength * options.consumptionRate -
      produceStrength * options.productionRate);
  const next = current + shift;
  const min = baseline * options.minFactor;
  const max = baseline * options.maxFactor;
  if (next < min) return min;
  if (next > max) return max;
  return next;
}

/**
 * Applies one production/consumption pulse to a planet's market in place.
 * Only commodities listed in the profile that also exist in both the planet's
 * market and the baseline are touched. Each touched commodity is shifted by
 * `computeCommodityPressure` and rounded to an integer.
 *
 * @param {Object} planet - Planet with `.market`.
 * @param {Object} profile - `{ produces: {commodity: strength}, consumes: {...} }`.
 *   Either side may be missing.
 * @param {Object} baseline - Baseline price map for this planet.
 * @param {Object} [options=DEFAULT_PRODUCTION_OPTIONS] - Tuning overrides.
 * @returns {Array<string>} Names of commodities whose price changed.
 */
export function applyProductionPulse(
  planet,
  profile,
  baseline,
  options = DEFAULT_PRODUCTION_OPTIONS,
) {
  if (!planet || !planet.market || !profile || !baseline) return [];

  const produces = profile.produces || {};
  const consumes = profile.consumes || {};
  const touched = new Set([...Object.keys(produces), ...Object.keys(consumes)]);

  const changed = [];
  for (const commodity of touched) {
    if (planet.market[commodity] === undefined) continue;
    if (baseline[commodity] === undefined) continue;

    const next = Math.round(
      computeCommodityPressure(
        planet.market[commodity],
        baseline[commodity],
        produces[commodity] || 0,
        consumes[commodity] || 0,
        options,
      ),
    );
    if (next !== planet.market[commodity]) {
      planet.market[commodity] = next;
      changed.push(commodity);
    }
  }
  return changed;
}
