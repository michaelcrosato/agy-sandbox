/**
 * FactionRegistry: pure, deterministic data + logic for per-player faction
 * standings and pairwise faction relations.
 *
 * The galaxy has a fixed roster of factions (e.g. Federation, Frontier League,
 * Pirates, Independents). Every player carries a numeric standing with each
 * faction, clamped to a configurable band (default `[-100, 100]`). Adjusting
 * one standing PROPAGATES through pairwise relations: helping a faction gives
 * a fraction of that gain to its allies and inflicts a matching loss on its
 * enemies. A configurable decay helper pulls standings toward neutral (zero),
 * so reputations heal over time when left alone.
 *
 * The module is pure: no DOM, no sockets, no `Math.random`. All state lives
 * in plain JSON-serializable maps so the P1 persistence layer can save and
 * restore reputations alongside markets.
 */

/**
 * Default faction roster used when the caller passes no factions.
 */
export const DEFAULT_FACTIONS = Object.freeze([
  "Federation",
  "Frontier League",
  "Pirates",
  "Independents",
]);

/**
 * Default pairwise relations between the default factions.
 * Shape: `{ [factionA]: { [factionB]: 'ally' | 'enemy' | 'neutral' } }`.
 * Relations are intentionally symmetric — both directions are populated so
 * lookups never need to try both orderings.
 */
export const DEFAULT_RELATIONS = Object.freeze({
  Federation: Object.freeze({
    "Frontier League": "neutral",
    Pirates: "enemy",
    Independents: "ally",
  }),
  "Frontier League": Object.freeze({
    Federation: "neutral",
    Pirates: "enemy",
    Independents: "neutral",
  }),
  Pirates: Object.freeze({
    Federation: "enemy",
    "Frontier League": "enemy",
    Independents: "neutral",
  }),
  Independents: Object.freeze({
    Federation: "ally",
    "Frontier League": "neutral",
    Pirates: "neutral",
  }),
});

/**
 * Tuning constants. All knobs in one frozen object so callers can override a
 * single field without losing the rest. Standings are continuous numbers; the
 * `*Threshold` fields control `classify()` boundaries (inclusive).
 */
export const DEFAULT_OPTIONS = Object.freeze({
  minStanding: -100,
  maxStanding: 100,
  hostileThreshold: -30,
  friendlyThreshold: 30,
  allyPropagation: 0.5,
  enemyPropagation: 0.5,
  decayRate: 0.01,
});

/**
 * Classifies a numeric standing using the supplied thresholds.
 * Boundaries are inclusive: `standing === friendlyThreshold` is friendly,
 * `standing === hostileThreshold` is hostile.
 *
 * @param {number} standing - Standing value.
 * @param {Object} [options=DEFAULT_OPTIONS] - Threshold source.
 * @returns {'hostile'|'neutral'|'friendly'}
 */
export function classifyStanding(standing, options = DEFAULT_OPTIONS) {
  if (standing <= options.hostileThreshold) return "hostile";
  if (standing >= options.friendlyThreshold) return "friendly";
  return "neutral";
}

/**
 * Clamps a value to the configured standing band.
 *
 * @param {number} value - Raw value.
 * @param {Object} options - Source of `minStanding` / `maxStanding`.
 * @returns {number} Clamped value.
 */
function clampStanding(value, options) {
  if (value < options.minStanding) return options.minStanding;
  if (value > options.maxStanding) return options.maxStanding;
  return value;
}

/**
 * Headless registry of factions, per-player standings, and pairwise relations.
 * All state is plain data and can be round-tripped through `JSON`.
 */
export class FactionRegistry {
  /**
   * @param {Object} [config={}]
   * @param {Array<string>} [config.factions=DEFAULT_FACTIONS] - Faction roster.
   * @param {Object} [config.relations=DEFAULT_RELATIONS] - Pairwise relation map.
   * @param {Object} [config.options] - Overrides merged onto `DEFAULT_OPTIONS`.
   * @param {Object} [config.standings={}] - Initial standings keyed by player.
   *   Shape: `{ [playerId]: { [faction]: number } }`.
   */
  constructor({
    factions = DEFAULT_FACTIONS,
    relations = DEFAULT_RELATIONS,
    options = {},
    standings = {},
  } = {}) {
    this.factions = [...factions];
    this.relations = relations;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.standings = standings;
  }

  /**
   * @param {string} faction
   * @returns {boolean} True if the faction is part of the roster.
   */
  hasFaction(faction) {
    return this.factions.includes(faction);
  }

  /**
   * Reads a player's standing with a faction. Unknown players or factions
   * read as 0 (neutral) without mutating state.
   *
   * @param {string} playerId
   * @param {string} faction
   * @returns {number}
   */
  getStanding(playerId, faction) {
    if (!this.hasFaction(faction)) return 0;
    const playerMap = this.standings[playerId];
    if (!playerMap) return 0;
    const value = playerMap[faction];
    return typeof value === "number" ? value : 0;
  }

  /**
   * Returns a shallow copy of every standing this player holds. Useful for
   * snapshots/serialization; unknown players yield an empty object.
   *
   * @param {string} playerId
   * @returns {Object<string, number>}
   */
  getAllStandings(playerId) {
    const playerMap = this.standings[playerId];
    return playerMap ? { ...playerMap } : {};
  }

  /**
   * Writes a player's standing directly, clamped to the configured band.
   * Does NOT propagate. Used internally by `adjustStanding`; exposed because
   * persistence layers may want to restore a snapshot value.
   *
   * @param {string} playerId
   * @param {string} faction
   * @param {number} value
   * @returns {number} The clamped value actually stored, or 0 if rejected.
   */
  setStanding(playerId, faction, value) {
    if (!this.hasFaction(faction)) return 0;
    const clamped = clampStanding(value, this.options);
    if (!this.standings[playerId]) this.standings[playerId] = {};
    this.standings[playerId][faction] = clamped;
    return clamped;
  }

  /**
   * Looks up the relation from `faction` toward `other`.
   *
   * @param {string} faction
   * @param {string} other
   * @returns {'ally'|'enemy'|'neutral'}
   */
  getRelation(faction, other) {
    if (faction === other) return "neutral";
    const row = this.relations[faction];
    if (!row) return "neutral";
    const rel = row[other];
    return rel === "ally" || rel === "enemy" ? rel : "neutral";
  }

  /**
   * Adjusts a player's standing with `faction` by `delta` and propagates a
   * fractional change to allied and enemy factions. Propagation magnitude is
   * driven by the REQUESTED delta (not the post-clamp change), so a player
   * already at the cap still suffers the diplomatic fallout of their action.
   *
   * Allies move with the primary faction (gain on positive delta, loss on
   * negative); enemies move against it. Neutral relations and the faction's
   * own row are skipped.
   *
   * @param {string} playerId
   * @param {string} faction
   * @param {number} delta
   * @returns {Object<string, number>} Map of every faction this call wrote,
   *   to the new clamped standing. Empty if `faction` is unknown.
   */
  adjustStanding(playerId, faction, delta) {
    if (!this.hasFaction(faction)) return {};
    const changes = {};
    const primary = this.setStanding(
      playerId,
      faction,
      this.getStanding(playerId, faction) + delta,
    );
    changes[faction] = primary;

    if (delta === 0) return changes;

    for (const other of this.factions) {
      if (other === faction) continue;
      const relation = this.getRelation(faction, other);
      if (relation === "ally") {
        changes[other] = this.setStanding(
          playerId,
          other,
          this.getStanding(playerId, other) + delta * this.options.allyPropagation,
        );
      } else if (relation === "enemy") {
        changes[other] = this.setStanding(
          playerId,
          other,
          this.getStanding(playerId, other) - delta * this.options.enemyPropagation,
        );
      }
    }
    return changes;
  }

  /**
   * Classifies a player's standing with a faction using the registry's
   * thresholds.
   *
   * @param {string} playerId
   * @param {string} faction
   * @returns {'hostile'|'neutral'|'friendly'}
   */
  classify(playerId, faction) {
    return classifyStanding(
      this.getStanding(playerId, faction),
      this.options,
    );
  }

  /**
   * Pulls every standing for a single player a fraction of the way toward
   * zero. `rate` is the fraction removed per call; `1.0` snaps to zero,
   * `0.0` is a no-op. Positive standings shrink, negative standings grow.
   *
   * @param {string} playerId
   * @param {number} [rate=this.options.decayRate]
   * @returns {Object<string, number>} Map of factions whose value moved, to
   *   the new clamped value.
   */
  decay(playerId, rate = this.options.decayRate) {
    const playerMap = this.standings[playerId];
    if (!playerMap) return {};
    const changes = {};
    for (const faction of Object.keys(playerMap)) {
      const current = playerMap[faction];
      const next = clampStanding(current - current * rate, this.options);
      if (next !== current) {
        playerMap[faction] = next;
        changes[faction] = next;
      }
    }
    return changes;
  }

  /**
   * Convenience wrapper that decays every tracked player. Order is the
   * insertion order of `this.standings`.
   *
   * @param {number} [rate=this.options.decayRate]
   * @returns {Object<string, Object<string, number>>} Per-player change map.
   */
  decayAll(rate = this.options.decayRate) {
    const all = {};
    for (const playerId of Object.keys(this.standings)) {
      const changed = this.decay(playerId, rate);
      if (Object.keys(changed).length > 0) all[playerId] = changed;
    }
    return all;
  }

  /**
   * Returns a JSON-safe snapshot. Deep-copies the standings map so the
   * caller cannot accidentally mutate live state.
   *
   * @returns {Object}
   */
  serialize() {
    const standings = {};
    for (const playerId of Object.keys(this.standings)) {
      standings[playerId] = { ...this.standings[playerId] };
    }
    return {
      factions: [...this.factions],
      relations: this.relations,
      options: { ...this.options },
      standings,
    };
  }

  /**
   * Rebuilds a registry from a `serialize()` snapshot (or any compatible
   * plain-data shape). Missing fields fall back to defaults.
   *
   * @param {Object} [data={}]
   * @returns {FactionRegistry}
   */
  static fromJSON(data = {}) {
    return new FactionRegistry({
      factions: data.factions,
      relations: data.relations,
      options: data.options,
      standings: data.standings,
    });
  }
}
