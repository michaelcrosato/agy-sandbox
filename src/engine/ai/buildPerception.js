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
export function defaultIsThreat(ent, self) {
  if (!ent || ent.type !== "ship" || ent.isDestroyed) return false;
  if (isPirateLike(ent)) return self.role !== "pirate";
  if (ent.role === "guard") return self.role === "pirate";
  return false;
}

/**
 * Default threat magnitude in [0,1]: a healthy, armed enemy is more dangerous;
 * a crippled one less so. Scaled off remaining armor.
 * @param {Object} ent
 * @returns {number}
 */
export function defaultThreatLevel(ent) {
  return clamp01(0.8 * armorFraction(ent));
}

/**
 * Default prey predicate: only pirates hunt, and only soft, non-combatant ships
 * that are not of the pirate's own faction.
 * @param {Object} ent - Candidate entity.
 * @param {Object} self - The perceiving ship.
 * @returns {boolean}
 */
export function defaultIsPrey(ent, self) {
  if (self.role !== "pirate") return false;
  if (!ent || ent.type !== "ship" || ent.isDestroyed) return false;
  if (isPirateLike(ent) || ent.role === "guard") return false;
  if (self.faction && ent.faction && self.faction === ent.faction) return false;
  return true;
}

/**
 * Default prey desirability in [0,1]: a soft target is attractive (baseline
 * 0.6) and an already-worn-down one even more so (up to 1.0).
 * @param {Object} ent
 * @returns {number}
 */
export function defaultPreyWeakness(ent) {
  return clamp01(0.6 + 0.4 * (1 - armorFraction(ent)));
}

/**
 * Default trade predicate: non-pirates treat nearby dockable planets as trade
 * opportunities.
 * @param {Object} ent - Candidate entity.
 * @param {Object} self - The perceiving ship.
 * @returns {boolean}
 */
export function defaultIsTrade(ent, self) {
  if (self.role === "pirate") return false;
  return !!ent && ent.type === "planet" && !ent.isDestroyed;
}

/**
 * Default trade profitability in [0,1]. A flat baseline — callers with live
 * market spreads can override this for a sharper signal.
 * @returns {number}
 */
export function defaultTradeProfit() {
  return 0.6;
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
 *   opportunities:{prey:Array<Object>, trades:Array<Object>}}}
 */
export function buildPerception(ship, entities, options = {}) {
  const opts = { ...DEFAULT_PERCEPTION_OPTIONS, ...options };
  const list = Array.isArray(entities) ? entities : [];
  const self = selfStateFromShip(ship);
  const threats = [];
  const prey = [];
  const trades = [];

  if (ship && ship.position) {
    for (const ent of list) {
      if (!ent || ent === ship || !ent.position) continue;
      if (ent.id !== undefined && ship.id !== undefined && ent.id === ship.id) {
        continue;
      }
      const distance = ship.position.distance(ent.position);
      if (!Number.isFinite(distance) || distance >= opts.sensorRange) continue;

      if (opts.isThreat(ent, ship)) {
        threats.push({
          distance,
          threat: clamp01(opts.threatLevel(ent, ship)),
        });
      }
      if (opts.isPrey(ent, ship)) {
        prey.push({
          distance,
          weakness: clamp01(opts.preyWeakness(ent, ship)),
        });
      }
      if (opts.isTrade(ent, ship)) {
        trades.push({ distance, profit: clamp01(opts.tradeProfit(ent, ship)) });
      }
    }
  }

  return { self, threats, opportunities: { prey, trades } };
}
