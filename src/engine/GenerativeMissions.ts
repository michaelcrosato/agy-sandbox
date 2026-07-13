/**
 * GenerativeMissions: pure, seeded mission generator that composes missions
 * from a snapshot of live world state.
 *
 * A real price shortage on planet X is what produces a delivery contract
 * routed to X; a notable bounty target in the world is what produces a hunt
 * mission against that target. Rewards, descriptions, and faction-standing
 * consequences are all derived from the live numbers the caller hands in.
 *
 * Determinism: callers MUST inject a seeded RNG via `options.rng`. The module
 * never calls `Math.random`, so identical world snapshots + identical seeds
 * produce byte-identical mission lists. A small `createSeededRng(seed)` helper
 * (mulberry32) is exported for convenience.
 *
 * Graceful degradation: missing economy data (`planets`/`baseMarkets` absent
 * or empty) suppresses delivery missions; missing `bountyTargets` suppresses
 * hunt missions; missing `factionRegistry` skips faction-standing
 * consequences. In every degraded shape the generator returns a (possibly
 * empty) array — it never throws on missing world state.
 */

/**
 * Default tuning. Every knob lives in one frozen object so callers can
 * override a single field without losing the rest.
 */
export const DEFAULT_GENERATIVE_OPTIONS = Object.freeze({
  /** Current/baseline ratio above which a planet/commodity counts as a shortage. */
  shortageRatio: 1.2,
  /** Current/baseline ratio at or below which a planet/commodity counts as a surplus source. */
  surplusRatio: 0.85,
  /** Cap on delivery missions returned per call. */
  maxDeliveryMissions: 4,
  /** Cap on hunt missions returned per call. */
  maxHuntMissions: 3,
  /** Minimum/maximum cargo tons for a generated delivery mission. */
  cargoMin: 2,
  cargoMax: 6,
  /** Flat reward added to every delivery on top of the gap-scaled component. */
  baseDeliveryReward: 500,
  /** Multiplier on `priceGap * cargoAmount` for the gap-scaled reward component. */
  deliveryRewardScale: 1.5,
  /** Flat reward added to every hunt on top of the bounty-scaled component. */
  baseHuntReward: 1500,
  /** Multiplier on the target's published bounty for hunt rewards. */
  huntRewardScale: 4,
  /** Standing delta applied to the destination's faction on delivery completion. */
  deliveryFactionDelta: 2,
  /** Standing delta applied to the target's faction on hunt completion (subtracted). */
  huntFactionDelta: 6,
  /** Price units shaved off the destination market per ton delivered. */
  marketReliefPerUnit: 4,
});

/**
 * Builds a mulberry32 PRNG closed over a single 32-bit seed. The returned
 * function takes no arguments and yields a number in `[0, 1)` — drop-in for
 * `Math.random` but deterministic across calls.
 *
 * @param {number} [seed=1] - Integer seed. Defaults to 1 to keep callers honest.
 * @returns {() => number}
 */
export function createSeededRng(seed = 1) {
  let state = seed >>> 0 || 1;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks an inclusive integer in `[min, max]` from an injected RNG.
 *
 * @param {() => number} rng - Seeded random source.
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Inclusive upper bound.
 * @returns {number}
 */
function randInt(rng, min, max) {
  if (max < min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Enumerates `(planet, commodity)` pairs whose current price is at least
 * `shortageRatio * baseline`, sorted highest-ratio first with a deterministic
 * (planet name, commodity) tiebreak so two callers with the same world
 * snapshot always see the same ordering.
 *
 * @param {Array<Object>} planets - Planet-like objects: `{ name, market }`.
 * @param {Object} baseMarkets - Map of planet name -> baseline market.
 * @param {number} shortageRatio - Multiplier threshold.
 * @returns {Array<{planet: Object, commodity: string, current: number, baseline: number, ratio: number}>}
 */
function findShortages(planets, baseMarkets, shortageRatio) {
  const shortages = [];
  for (const planet of planets) {
    if (!planet || !planet.market) continue;
    const baseline = baseMarkets[planet.name];
    if (!baseline) continue;
    for (const commodity of Object.keys(planet.market)) {
      const current = planet.market[commodity];
      const base = baseline[commodity];
      if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) {
        continue;
      }
      const ratio = current / base;
      if (ratio >= shortageRatio) {
        shortages.push({
          planet,
          commodity,
          current,
          baseline: base,
          ratio,
        });
      }
    }
  }
  shortages.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    if (a.planet.name !== b.planet.name) {
      return a.planet.name < b.planet.name ? -1 : 1;
    }
    return a.commodity < b.commodity ? -1 : 1;
  });
  return shortages;
}

/**
 * Finds the cheapest source planet for `commodity` that is at or below
 * `surplusRatio * baseline`, excluding `excludeName`. Deterministic tiebreak
 * on planet name.
 *
 * @param {Array<Object>} planets
 * @param {Object} baseMarkets
 * @param {string} commodity
 * @param {string} excludeName - Origin planet for the shortage (we don't ship to ourselves).
 * @param {number} surplusRatio
 * @returns {?{planet: Object, current: number, baseline: number, ratio: number}}
 */
function findSurplusSource(
  planets,
  baseMarkets,
  commodity,
  excludeName,
  surplusRatio,
) {
  let best = null;
  for (const planet of planets) {
    if (!planet || !planet.market) continue;
    if (planet.name === excludeName) continue;
    const baseline = baseMarkets[planet.name];
    if (!baseline) continue;
    const current = planet.market[commodity];
    const base = baseline[commodity];
    if (!Number.isFinite(current) || !Number.isFinite(base) || base <= 0) {
      continue;
    }
    const ratio = current / base;
    if (ratio > surplusRatio) continue;
    if (
      best === null ||
      ratio < best.ratio ||
      (ratio === best.ratio && planet.name < best.planet.name)
    ) {
      best = { planet, current, baseline: base, ratio };
    }
  }
  return best;
}

/**
 * Composes a list of missions from a snapshot of the living galaxy.
 *
 * @param {Object} [world={}] - World snapshot.
 * @param {Array<Object>} [world.planets] - Planet-like records (`{ name, market }`).
 * @param {Object} [world.baseMarkets] - Baseline price table keyed by planet name.
 * @param {Array<{name: string, faction?: string, locationPlanet?: string, bounty?: number}>} [world.bountyTargets]
 *   Notable bounty NPCs alive in the world.
 * @param {Object<string,string>} [world.planetFactions] - Map planet name -> controlling faction.
 * @param {string} [world.playerId] - Player the consequences attach to.
 * @param {Object} [options={}]
 * @param {() => number} [options.rng] - REQUIRED seeded RNG, validated at runtime (e.g. `createSeededRng`).
 * @param {Object} [options.tuning] - Overrides merged onto `DEFAULT_GENERATIVE_OPTIONS`.
 * @returns {Array<Object>} Generated missions; empty when no eligible shortages/targets exist.
 */
export function generateMissionsFromWorld(world: any = {}, options: any = {}) {
  const rng = options.rng;
  if (typeof rng !== "function") {
    throw new Error(
      "generateMissionsFromWorld requires options.rng (seeded RNG function)",
    );
  }
  const tuning = { ...DEFAULT_GENERATIVE_OPTIONS, ...(options.tuning || {}) };

  const planets = Array.isArray(world.planets) ? world.planets : [];
  const baseMarkets =
    world.baseMarkets && typeof world.baseMarkets === "object"
      ? world.baseMarkets
      : {};
  const bountyTargets = Array.isArray(world.bountyTargets)
    ? world.bountyTargets
    : [];
  const planetFactions =
    world.planetFactions && typeof world.planetFactions === "object"
      ? world.planetFactions
      : {};
  const playerId = world.playerId || null;

  const missions = [];
  let counter = 0;

  const shortages = findShortages(planets, baseMarkets, tuning.shortageRatio);
  let deliveriesEmitted = 0;
  for (const shortage of shortages) {
    if (deliveriesEmitted >= tuning.maxDeliveryMissions) break;
    const source = findSurplusSource(
      planets,
      baseMarkets,
      shortage.commodity,
      shortage.planet.name,
      tuning.surplusRatio,
    );
    if (!source) continue;
    const priceGap = shortage.current - source.current;
    if (priceGap <= 0) continue;

    const cargoAmount = randInt(rng, tuning.cargoMin, tuning.cargoMax);
    const reward = Math.round(
      tuning.baseDeliveryReward +
        priceGap * cargoAmount * tuning.deliveryRewardScale,
    );
    const destinationFaction = planetFactions[shortage.planet.name] || null;
    const sourceFaction = planetFactions[source.planet.name] || null;

    counter += 1;
    const priceDelta = Math.max(
      1,
      Math.round(cargoAmount * tuning.marketReliefPerUnit),
    );

    missions.push({
      id: `gen-delivery-${source.planet.name}-${shortage.planet.name}-${shortage.commodity}-${counter}`,
      type: "delivery",
      generated: true,
      title: `Relief Run: ${shortage.commodity} to ${shortage.planet.name}`,
      description:
        `${shortage.planet.name} is paying ${shortage.current} CR/ton for ${shortage.commodity} ` +
        `(baseline ${shortage.baseline}). Source ${cargoAmount} tons on ${source.planet.name} at ${source.current} CR/ton and ` +
        `deliver to ${shortage.planet.name}.`,
      origin: source.planet.name,
      destination: shortage.planet.name,
      cargoItem: shortage.commodity,
      cargoAmount,
      reward,
      baselinePrice: shortage.baseline,
      shortagePrice: shortage.current,
      sourcePrice: source.current,
      priceGap,
      destinationFaction,
      sourceFaction,
      isAccepted: false,
      isCompleted: false,
      consequences: {
        marketRelief: {
          planetName: shortage.planet.name,
          commodity: shortage.commodity,
          priceDelta,
        },
        factionDeltas: destinationFaction
          ? [
              {
                playerId,
                faction: destinationFaction,
                delta: tuning.deliveryFactionDelta,
              },
            ]
          : [],
      },
    });
    deliveriesEmitted += 1;
  }

  let huntsEmitted = 0;
  for (const target of bountyTargets) {
    if (huntsEmitted >= tuning.maxHuntMissions) break;
    if (
      !target ||
      typeof target.name !== "string" ||
      target.name.length === 0
    ) {
      continue;
    }
    const bountyValue = Number.isFinite(target.bounty) ? target.bounty : 250;
    const reward = Math.round(
      tuning.baseHuntReward + bountyValue * tuning.huntRewardScale,
    );
    const targetFaction = target.faction || null;
    counter += 1;
    const factionDeltas = targetFaction
      ? [
          {
            playerId,
            faction: targetFaction,
            delta: -tuning.huntFactionDelta,
          },
        ]
      : [];

    const locationTag = target.locationPlanet
      ? ` reported near ${target.locationPlanet}`
      : "";
    const factionTag = targetFaction ? ` (${targetFaction})` : "";

    missions.push({
      id: `gen-hunt-${target.name}-${counter}`,
      type: "hunt",
      generated: true,
      title: `Wanted: ${target.name}${factionTag}`,
      description: `Eliminate ${target.name}${factionTag}${locationTag}.`,
      targetName: target.name,
      destination: target.locationPlanet || null,
      targetFaction,
      reward,
      bounty: bountyValue,
      isAccepted: false,
      isCompleted: false,
      consequences: {
        factionDeltas,
      },
    });
    huntsEmitted += 1;
  }

  return missions;
}

/**
 * Applies the deterministic consequences a generated mission promised at
 * creation time. Mutates the destination planet's market (clamped above the
 * baseline so a relief run can't drive a shortage below its long-term price)
 * and routes faction standing deltas through the supplied `FactionRegistry`.
 *
 * @param {Object} mission - A mission produced by `generateMissionsFromWorld`.
 * @param {Object} [world={}]
 * @param {Array<Object>} [world.planets] - Planet records whose markets may be mutated.
 * @param {Object} [world.baseMarkets] - Baselines used as the price floor for relief.
 * @param {Object} [world.factionRegistry] - `FactionRegistry`-shaped object exposing `adjustStanding`.
 * @returns {{marketChanges: Array<Object>, factionChanges: Array<Object>}}
 */
export function applyMissionConsequences(mission, world: any = {}) {
  const result = { marketChanges: [], factionChanges: [] };
  if (!mission || !mission.consequences) return result;

  const planets = Array.isArray(world.planets) ? world.planets : [];
  const baseMarkets =
    world.baseMarkets && typeof world.baseMarkets === "object"
      ? world.baseMarkets
      : {};
  const factionRegistry = world.factionRegistry || null;

  const relief = mission.consequences.marketRelief;
  if (relief && relief.planetName && relief.commodity) {
    const target = planets.find((p) => p && p.name === relief.planetName);
    if (
      target &&
      target.market &&
      Number.isFinite(target.market[relief.commodity])
    ) {
      const before = target.market[relief.commodity];
      const baseline = baseMarkets[relief.planetName]
        ? baseMarkets[relief.planetName][relief.commodity]
        : null;
      const floor = Number.isFinite(baseline) ? baseline : 0;
      const proposed = before - (relief.priceDelta || 0);
      const after = Math.max(floor, proposed);
      if (after !== before) {
        target.market[relief.commodity] = after;
      }
      result.marketChanges.push({
        planetName: relief.planetName,
        commodity: relief.commodity,
        before,
        after,
      });
    }
  }

  const deltas = Array.isArray(mission.consequences.factionDeltas)
    ? mission.consequences.factionDeltas
    : [];
  if (
    deltas.length > 0 &&
    factionRegistry &&
    typeof factionRegistry.adjustStanding === "function"
  ) {
    for (const fd of deltas) {
      if (!fd || !fd.faction || !fd.playerId) continue;
      const changes = factionRegistry.adjustStanding(
        fd.playerId,
        fd.faction,
        fd.delta,
      );
      result.factionChanges.push({
        playerId: fd.playerId,
        faction: fd.faction,
        delta: fd.delta,
        changes,
      });
    }
  }

  return result;
}
