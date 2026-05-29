import {
  applyProductionPulse,
  DEFAULT_PRODUCTION_OPTIONS,
} from "./ProductionModel.js";

/**
 * GalaxyHeartbeat advances the galactic economy independently of any connected
 * player. Each pulse first lets every planet's producer/consumer profile push
 * its local prices (surplus down, demand up, bounded around baseline), then
 * lets prices flow along trade lanes toward the prices of connected systems
 * (simulated arbitrage) while drifting gently back toward each market's
 * baseline. Over many pulses, production creates real supply pressure that
 * the lane-diffusion ripple then propagates to neighbors — the world keeps
 * living, and producing, when no one watches.
 *
 * The class is pure and deterministic: it owns no timers, sockets, or randomness.
 */
export class GalaxyHeartbeat {
  /**
   * @param {Object} config
   * @param {Array<Object>} [config.planets] - Market-bearing systems; each needs `.name` and `.market`.
   * @param {Object} [config.baseMarkets] - Baseline price map keyed by planet name, for equilibrium drift.
   * @param {Object} [config.lanes] - Adjacency: planet name -> array of connected planet names.
   * @param {number} [config.diffusionRate] - Fraction (0..1) of the gap to a neighbor average closed per pulse.
   * @param {number} [config.equilibriumRate] - Fraction (0..1) of the gap to baseline closed per pulse.
   * @param {Object} [config.profiles] - Map of planet name -> producer/consumer profile
   *   (`{ produces: {commodity: strength}, consumes: {...} }`). Planets without a profile
   *   skip the production step. Defaults to `{}` so existing call sites are unaffected.
   * @param {Object} [config.productionOptions] - Tuning passed to `applyProductionPulse`.
   *   See `DEFAULT_PRODUCTION_OPTIONS` in `ProductionModel.js`.
   */
  constructor({
    planets = [],
    baseMarkets = {},
    lanes = {},
    diffusionRate = 0.15,
    equilibriumRate = 0.03,
    profiles = {},
    productionOptions = DEFAULT_PRODUCTION_OPTIONS,
  } = {}) {
    this.planets = planets;
    this.baseMarkets = baseMarkets;
    this.lanes = lanes;
    this.diffusionRate = diffusionRate;
    this.equilibriumRate = equilibriumRate;
    this.profiles = profiles;
    this.productionOptions = productionOptions;
    this.pulses = 0;
  }

  /**
   * Advances the galaxy by one heartbeat. Price changes are computed from the
   * pre-pulse state and applied simultaneously, so the result is independent of
   * planet ordering.
   * @returns {Array<string>} Names of planets whose market changed this pulse.
   */
  pulse() {
    // 1. Production & consumption pressure each market on its own first.
    // Each planet's production step depends only on its own market and profile,
    // so order is irrelevant; mutating in place is safe and keeps the diffusion
    // pass downstream working off the post-production prices.
    const producedChanges = new Set();
    for (const planet of this.planets) {
      if (!planet.market) continue;
      const profile = this.profiles[planet.name];
      if (!profile) continue;
      const baseline = this.baseMarkets[planet.name];
      if (!baseline) continue;
      const changedCommodities = applyProductionPulse(
        planet,
        profile,
        baseline,
        this.productionOptions,
      );
      if (changedCommodities.length > 0) producedChanges.add(planet.name);
    }

    // 2. Trade-lane diffusion + equilibrium drift, applied simultaneously
    //    against the post-production snapshot so ordering still doesn't matter.
    const byName = new Map(this.planets.map((p) => [p.name, p]));
    const updates = [];

    for (const planet of this.planets) {
      if (!planet.market) continue;

      const neighbors = (this.lanes[planet.name] || [])
        .map((n) => byName.get(n))
        .filter((nb) => nb && nb.market);
      const base = this.baseMarkets[planet.name];

      for (const commodity of Object.keys(planet.market)) {
        const current = planet.market[commodity];
        // Never diffuse from a non-finite price — leave it for EconomyManager's
        // self-heal rather than averaging NaN into healthy neighbours.
        if (!Number.isFinite(current)) continue;
        let target = current;

        // 1. Trade-lane diffusion toward the average price among connected systems.
        if (neighbors.length > 0) {
          let sum = 0;
          let count = 0;
          for (const nb of neighbors) {
            // Only finite neighbour prices contribute (a NaN neighbour must not
            // poison the average and spread across the lane).
            if (Number.isFinite(nb.market[commodity])) {
              sum += nb.market[commodity];
              count += 1;
            }
          }
          if (count > 0) {
            const avg = sum / count;
            target += this.diffusionRate * (avg - current);
          }
        }

        // 2. Gentle equilibrium pull back toward the system's baseline price.
        if (base && Number.isFinite(base[commodity])) {
          target += this.equilibriumRate * (base[commodity] - current);
        }

        const next = Math.round(target);
        if (Number.isFinite(next) && next !== current) {
          updates.push({ planet, commodity, value: next });
        }
      }
    }

    for (const u of updates) {
      u.planet.market[u.commodity] = u.value;
    }

    this.pulses += 1;

    const changed = new Set([
      ...producedChanges,
      ...updates.map((u) => u.planet.name),
    ]);
    return [...changed];
  }

  /**
   * Derives trade lanes from planet sectors: every planet is connected to the
   * others sharing its sector, plus those in directly adjacent sectors.
   * @param {Array<Object>} planets - Planets carrying a `.sector` tag.
   * @param {Object} [sectorAdjacency] - Map of sector -> adjacent sector names.
   * @returns {Object} Adjacency map of planet name -> connected planet names.
   */
  static buildLanesBySector(planets, sectorAdjacency = {}) {
    const lanes = {};
    for (const p of planets) {
      lanes[p.name] = [];
    }
    for (const a of planets) {
      for (const b of planets) {
        if (a === b) continue;
        const sameSector = a.sector && a.sector === b.sector;
        const adjacentSector =
          a.sector &&
          b.sector &&
          (sectorAdjacency[a.sector] || []).includes(b.sector);
        if (sameSector || adjacentSector) {
          lanes[a.name].push(b.name);
        }
      }
    }
    return lanes;
  }
}
