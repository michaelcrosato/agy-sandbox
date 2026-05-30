/**
 * buildPerception: pure adapter from live engine state to the `UtilityAI`
 * perception snapshot (spec 017).
 *
 * `UtilityAI.selectGoal` scores goals from a normalized snapshot
 * (`{ self, threats, opportunities: { prey, trades } }`) but says nothing about
 * where that snapshot comes from. This module is that missing bridge: given the
 * perceiving ship and the live entity list, it classifies nearby entities into
 * threats / prey / trade opportunities and measures their distance, so the
 * scorer can turn "the world right now" into an advisory goal.
 *
 * Design constraints (mirrors `UtilityAI`):
 * - Pure: no DOM, no sockets, no `Math.random`. A given world always produces
 *   the same snapshot, so goal selection downstream is deterministic.
 * - Decoupled: the default classifiers key off duck-typed `role`/`type`/`faction`
 *   fields and never import `AIController`, so there is no engine import cycle.
 *   Every classifier is overridable via `options` for faction-aware callers.
 *
 * Default classification (the perceiving ship's role decides what it cares about):
 * - threats  — pirates threaten non-pirates; guards threaten pirates.
 * - prey     — only pirates hunt prey: soft, non-combatant ships of another faction.
 * - trades   — only non-pirates trade: nearby dockable planets.
 */

import { clamp01, selfStateFromShip } from "./UtilityAI.js";

/**
 * Remaining-armor fraction in [0,1]. Unknown/zero-max armor reads as 1 (full)
 * so a missing stat never makes an entity look artificially weak/dangerous.
 * @param {Object} ent
 * @returns {number}
 */
function armorFraction(ent) {
  if (
    !ent ||
    !Number.isFinite(ent.armor) ||
    !Number.isFinite(ent.maxArmor) ||
    ent.maxArmor <= 0
  ) {
    return 1;
  }
  return clamp01(ent.armor / ent.maxArmor);
}

/**
 * Pirate-class check mirroring `AIController.isPirateShip` (role-first, name
 * fallback), inlined here to avoid an `AIController` import cycle.
 * @param {Object} ent
 * @returns {boolean}
 */
function isPirateLike(ent) {
  if (!ent) return false;
  if (ent.role === "pirate") return true;
  if (typeof ent.role === "string" && ent.role.length > 0) return false;
  const n = ent.name;
  return (
    typeof n === "string" && (n.includes("Pirate") || n.includes("Raider"))
  );
}

/**
 * Default threat predicate: is `ent` something that would attack `self`?
 * Pirates threaten anyone who is not a pirate; guards threaten pirates.
 * @param {Object} ent - Candidate entity.
 * @param {Object} self - The perceiving ship.
 * @returns {boolean}
 */
export function defaultIsThreat(ent, self, opts = {}) {
  if (!ent || ent.type !== "ship" || ent.isDestroyed) return false;

  // Use faction standings & relations if available
  const selfFaction = self.faction;
  const targetFaction = ent.faction;
  const factionPolicy = opts.factionPolicy;
  const standingPolicy = opts.standingPolicy;

  // Conflict zone threat check
  if (
    opts.isConflictZone &&
    opts.conflictFactionA &&
    opts.conflictFactionB &&
    selfFaction &&
    targetFaction
  ) {
    const fA = opts.conflictFactionA;
    const fB = opts.conflictFactionB;
    if (
      (selfFaction === fA && targetFaction === fB) ||
      (selfFaction === fB && targetFaction === fA)
    ) {
      return true;
    }
  }

  if (factionPolicy && selfFaction && targetFaction) {
    if (factionPolicy.isHostile(selfFaction, targetFaction)) {
      return true;
    }
  }

  if (standingPolicy && selfFaction && ent.id != null) {
    if (standingPolicy.isHostile(ent.id, selfFaction)) {
      return true;
    }
  }

  // Legacy fallback
  if (isPirateLike(ent)) return self.role !== "pirate";
  if (ent.role === "guard") return self.role === "pirate";
  return false;
}

/**
 * Default threat magnitude in [0,1]: a healthy, armed enemy is more dangerous;
 * a crippled one less so. Scaled off remaining armor.
 * @param {Object} ent
 * @param {Object} self
 * @param {Object} [_opts]
 * @returns {number}
 */
export function defaultThreatLevel(ent, self, _opts = {}) {
  _opts;
  return clamp01(0.8 * armorFraction(ent));
}

/**
 * Default prey predicate: only pirates hunt, and only soft, non-combatant ships
 * that are not of the pirate's own faction.
 * @param {Object} ent - Candidate entity.
 * @param {Object} self - The perceiving ship.
 * @param {Object} [opts]
 * @returns {boolean}
 */
export function defaultIsPrey(ent, self, opts = {}) {
  if (self.role !== "pirate") return false;
  if (!ent || ent.type !== "ship" || ent.isDestroyed) return false;

  const selfFaction = self.faction;
  const targetFaction = ent.faction;
  const factionPolicy = opts.factionPolicy;

  if (factionPolicy && selfFaction && targetFaction) {
    if (selfFaction === targetFaction) return false;
    if (factionPolicy.isAllied(selfFaction, targetFaction)) return false;
    return true;
  }

  // Legacy fallback
  if (isPirateLike(ent) || ent.role === "guard") return false;
  if (self.faction && ent.faction && self.faction === ent.faction) return false;
  return true;
}

/**
 * Default prey desirability in [0,1]: a soft target is attractive (baseline
 * 0.6) and an already-worn-down one even more so (up to 1.0).
 * @param {Object} ent
 * @param {Object} self
 * @param {Object} [_opts]
 * @returns {number}
 */
export function defaultPreyWeakness(ent, self, _opts = {}) {
  _opts;
  return clamp01(0.6 + 0.4 * (1 - armorFraction(ent)));
}

/**
 * Default trade predicate: non-pirates treat nearby dockable planets as trade
 * opportunities.
 * @param {Object} ent - Candidate entity.
 * @param {Object} self - The perceiving ship.
 * @param {Object} [opts]
 * @returns {boolean}
 */
export function defaultIsTrade(ent, self, opts = {}) {
  if (self.role === "pirate") return false;
  if (!ent || ent.type !== "planet" || ent.isDestroyed) return false;

  const selfFaction = self.faction;
  const targetFaction = ent.faction;
  const factionPolicy = opts.factionPolicy;

  if (factionPolicy && selfFaction && targetFaction) {
    if (factionPolicy.isHostile(selfFaction, targetFaction)) {
      return false;
    }
  }

  return true;
}

/**
 * Default trade profitability in [0,1] derived from market spreads.
 * @param {Object} ent
 * @param {Object} self
 * @param {Object} [opts]
 * @returns {number}
 */
export function defaultTradeProfit(ent, self, opts = {}) {
  if (!ent || ent.type !== "planet" || !ent.market) return 0.6;
  const list = opts.entities || [];
  const otherPlanets = list.filter(
    (e) => e && e.type === "planet" && e !== ent && e.market,
  );
  if (otherPlanets.length === 0) return 0.6;

  const registry = opts.factionRegistry;
  const shipId = self.id || "ship";

  const commodities = [
    "food",
    "electronics",
    "minerals",
    "luxuries",
    "contraband",
    "machinery",
    "ore",
  ];
  let maxSpread = 0;

  for (const item of commodities) {
    const baseBuyPrice = ent.market[item];
    if (typeof baseBuyPrice !== "number") continue;

    // Apply standings price modifier on buy if registry is present
    let buyPrice = baseBuyPrice;
    if (
      registry &&
      ent.faction &&
      typeof registry.priceModifier === "function"
    ) {
      const modifier = registry.priceModifier(shipId, ent.faction, "buy");
      buyPrice = Math.max(1, Math.round(baseBuyPrice * modifier));
    }

    for (const other of otherPlanets) {
      const baseSellPrice = other.market[item];
      if (typeof baseSellPrice !== "number") continue;

      // Contraband 1.5x premium at black markets
      let priceThere = baseSellPrice;
      if (
        item === "contraband" &&
        other.services &&
        other.services.blackMarket
      ) {
        priceThere = Math.round(baseSellPrice * 1.5);
      }

      // Apply standings price modifier on sell if registry is present
      let sellPrice = priceThere;
      if (
        registry &&
        other.faction &&
        typeof registry.priceModifier === "function"
      ) {
        const modifier = registry.priceModifier(shipId, other.faction, "sell");
        sellPrice = Math.max(1, Math.round(priceThere * modifier));
      }

      // Apply transaction tax rate deduction if registry is present
      if (
        registry &&
        other.faction &&
        typeof registry.getStanding === "function"
      ) {
        const standing = registry.getStanding(shipId, other.faction);
        let taxRate = 0.05; // default neutral tax
        if (other.faction === "Independents") {
          taxRate = 0.0;
        } else if (standing >= 50) {
          taxRate = 0.0;
        } else if (standing <= -16) {
          taxRate = 0.15;
        }
        sellPrice = Math.max(1, Math.round(sellPrice * (1 - taxRate)));
      }

      const diff = sellPrice - buyPrice;
      if (diff > maxSpread) {
        maxSpread = diff;
      }
    }
  }

  return clamp01(0.2 + 0.75 * Math.min(maxSpread / 300, 1));
}

/**
 * Default options bag. Every classifier is overridable so a faction-aware
 * caller can swap in `factionPolicy`-driven hostility without rewriting the
 * distance/snapshot plumbing.
 */
export const DEFAULT_PERCEPTION_OPTIONS = Object.freeze({
  sensorRange: 800,
  isThreat: defaultIsThreat,
  threatLevel: defaultThreatLevel,
  isPrey: defaultIsPrey,
  preyWeakness: defaultPreyWeakness,
  isTrade: defaultIsTrade,
  tradeProfit: defaultTradeProfit,
});

/**
 * Helper to determine if a ship is targeted by security guards in its vicinity.
 * @param {Object} ship - The perceiving ship.
 * @param {Array<Object>} entities - All sector entities.
 * @returns {boolean} True if a guard within 600 units is targeting/scanning the ship.
 */
export function isTargetedBySecurity(ship, entities) {
  if (!ship || !ship.isSmuggler) return false;
  if (!Array.isArray(entities)) return false;
  for (const ent of entities) {
    if (
      ent &&
      ent.type === "ship" &&
      !ent.isDestroyed &&
      ent.role === "guard"
    ) {
      if (ship.position && ent.position) {
        const dist = ship.position.distance(ent.position);
        if (dist <= 600) {
          const isTargeting =
            ent.target === ship ||
            ent.targetId === ship.id ||
            (ent.ship &&
              (ent.ship.target === ship || ent.ship.targetId === ship.id));
          if (isTargeting) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Builds a `UtilityAI` perception snapshot from live engine state.
 *
 * Scans `entities` once, keeping only those within `sensorRange` of `ship`, and
 * buckets each into threats / prey / trades via the (overridable) classifiers,
 * recording its distance and a [0,1] magnitude. The `self` block is derived from
 * the ship's own health/energy/cargo via `selfStateFromShip`.
 *
 * @param {Object} ship - The perceiving ship (needs `position.distance`, plus
 *   `role`/`faction` for the default classifiers).
 * @param {Array<Object>} entities - Live entity list (ships, planets, …).
 * @param {Object} [options] - Overrides merged over `DEFAULT_PERCEPTION_OPTIONS`.
 * @returns {{self:Object, threats:Array<Object>,
 *   opportunities:{prey:Array<Object>, trades:Array<Object>},
 *   isTargetedBySecurity:boolean}}
 */
export function buildPerception(ship, entities, options = {}) {
  const opts = { ...DEFAULT_PERCEPTION_OPTIONS, ...options };
  // Attach entities list so classifiers can access other entities
  opts.entities = entities;

  const list = Array.isArray(entities) ? entities : [];
  const self = selfStateFromShip(ship);
  const threats = [];
  const prey = [];
  const trades = [];

  let activeSensorRange = opts.sensorRange;
  if (ship && ship.position) {
    for (const ent of list) {
      if (
        ent &&
        ent.type === "cosmic_storm" &&
        ent.hazardType === "radioactive_cloud" &&
        ent.position &&
        Number.isFinite(ent.radius)
      ) {
        const dx = ship.position.x - ent.position.x;
        const dy = ship.position.y - ent.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= ent.radius) {
          activeSensorRange *= 0.5;
          break;
        }
      }
    }
  }

  if (ship && ship.position) {
    for (const ent of list) {
      if (!ent || ent === ship || !ent.position) continue;
      if (ent.id !== undefined && ship.id !== undefined && ent.id === ship.id) {
        continue;
      }
      const distance = ship.position.distance(ent.position);
      if (!Number.isFinite(distance) || distance >= activeSensorRange) continue;

      if (opts.isThreat(ent, ship, opts)) {
        threats.push({
          distance,
          threat: clamp01(opts.threatLevel(ent, ship, opts)),
        });
      }
      if (opts.isPrey(ent, ship, opts)) {
        prey.push({
          distance,
          weakness: clamp01(opts.preyWeakness(ent, ship, opts)),
        });
      }
      if (opts.isTrade(ent, ship, opts)) {
        trades.push({
          distance,
          profit: clamp01(opts.tradeProfit(ent, ship, opts)),
        });
      }
    }
  }

  const targetedBySecurity = isTargetedBySecurity(ship, list);

  return {
    self,
    threats,
    opportunities: { prey, trades },
    isTargetedBySecurity: targetedBySecurity,
  };
}
