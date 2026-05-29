/**
 * GalaxyHeartbeat advances the galactic economy independently of any connected
 * player. Each pulse lets commodity prices flow along trade lanes toward the
 * prices of connected systems (simulated arbitrage) while drifting gently back
 * toward each market's baseline. Over many pulses, a price shock in one system
 * ripples outward to its neighbors — the world keeps living when no one watches.
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
   */
  constructor({
    planets = [],
    baseMarkets = {},
    lanes = {},
    diffusionRate = 0.15,
    equilibriumRate = 0.03,
  } = {}) {
    this.planets = planets;
    this.baseMarkets = baseMarkets;
    this.lanes = lanes;
    this.diffusionRate = diffusionRate;
    this.equilibriumRate = equilibriumRate;
    this.pulses = 0;
  }

  /**
   * Advances the galaxy by one heartbeat. Price changes are computed from the
   * pre-pulse state and applied simultaneously, so the result is independent of
   * planet ordering.
   * @returns {Array<string>} Names of planets whose market changed this pulse.
   */
  pulse() {
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
        let target = current;

        // 1. Trade-lane diffusion toward the average price among connected systems.
        if (neighbors.length > 0) {
          let sum = 0;
          let count = 0;
          for (const nb of neighbors) {
            if (nb.market[commodity] !== undefined) {
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
        if (base && base[commodity] !== undefined) {
          target += this.equilibriumRate * (base[commodity] - current);
        }

        const next = Math.round(target);
        if (next !== current) {
          updates.push({ planet, commodity, value: next });
        }
      }
    }

    for (const u of updates) {
      u.planet.market[u.commodity] = u.value;
    }

    this.pulses += 1;

    const changed = new Set(updates.map((u) => u.planet.name));
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
