/**
 * UtilityAI: pure, headless, deterministic goal-scoring for NPC agents.
 *
 * The module groundwork for evolving role-FSMs (see `AIController`) into
 * goal-driven agents. Given a `perception` snapshot of an agent's situation
 * (its own health/energy/cargo, nearby threats, nearby opportunities) it
 * scores a small fixed catalogue of high-level goals and returns the
 * highest-scoring one with its score and the full score table.
 *
 * The scoring functions are intentionally legible and tunable: each goal's
 * utility is a small algebraic combination of perception fields and named
 * weights in `DEFAULT_UTILITY_OPTIONS`. A caller can override one knob
 * without losing the rest, and the formulas are simple enough that a human
 * can predict the winner from the inputs.
 *
 * Constraints enforced here:
 * - No DOM, no sockets, no `Math.random`. Pure functions of the snapshot.
 * - Determinism: ties between goal scores are broken by a fixed iteration
 *   order so the same snapshot always selects the same goal.
 * - Shape compatibility: this is a *consultable helper*, not a replacement
 *   for `AIController`. It returns advisory goals; the FSM (or a future
 *   planner) decides how to act on them.
 *
 * Perception snapshot shape:
 *   {
 *     self: {
 *       shield: number in [0,1],   // fraction of max shield remaining
 *       armor:  number in [0,1],   // fraction of max armor remaining
 *       energy: number in [0,1],   // fraction of max energy remaining
 *       cargoFill: number in [0,1] // fraction of cargo capacity occupied
 *     },
 *     threats: [
 *       { distance: number, threat: number in [0,1] }
 *     ],
 *     opportunities: {
 *       prey:   [{ distance: number, weakness: number in [0,1] }],
 *       trades: [{ distance: number, profit:   number in [0,1] }]
 *     }
 *   }
 *
 * All distance comparisons are made through `proximityFactor`, which maps
 * `distance` to a 1.0-at-touch, 0.0-at-sensor-edge factor; entities beyond
 * `sensorRange` contribute nothing.
 */

/**
 * Catalogue of high-level goals the module can recommend. Stored as a
 * frozen string-keyed map so callers can compare with `Goals.ENGAGE`
 * rather than scattering string literals.
 */
export const Goals = Object.freeze({
  ESCAPE_SECURITY: "ESCAPE_SECURITY",
  ENGAGE: "ENGAGE",
  FLEE: "FLEE",
  TRADE: "TRADE",
  REGROUP: "REGROUP",
  PATROL: "PATROL",
});

/**
 * Deterministic iteration order used both when computing the score table
 * and when breaking ties in `selectGoal`. Earlier entries win ties.
 */
export const GOAL_ORDER = Object.freeze([
  Goals.ESCAPE_SECURITY,
  Goals.ENGAGE,
  Goals.FLEE,
  Goals.TRADE,
  Goals.REGROUP,
  Goals.PATROL,
]);

/**
 * Default tuning. All knobs live in one frozen object so callers can
 * override a single field without losing the rest.
 *
 * Field reference:
 * - `sensorRange`           — distance at which perception cuts off.
 * - `engageBoost`           — multiplier on the ENGAGE score so a clean
 *   weak-prey opportunity comfortably clears `patrolBaseline`.
 * - `engageThreatPenalty`   — fraction of `threatPressure` subtracted from
 *   the ENGAGE multiplier (0 → ignore threats, 1 → refuse to engage under
 *   any pressure).
 * - `fleeArmorWeight`       — weight applied to the squared armor deficit;
 *   raising this makes FLEE rise faster as armor drops.
 * - `fleeThreatBase`        — minimum threat contribution to FLEE even
 *   when the agent is healthy (so a fresh ship still flinches at a fleet).
 * - `fleeThreatArmorWeight` — extra threat weight scaled by armor panic;
 *   a wounded agent fears a given threat more than a healthy one does.
 * - `tradeThreatPower`      — exponent on `(1 - threatPressure)` for the
 *   trade penalty; higher means trade desire collapses faster near
 *   threats.
 * - `regroupBoost`          — ceiling on the REGROUP score so it can rise
 *   above PATROL but rarely above ENGAGE/FLEE.
 * - `regroupArmorFloor`     — when armor falls below this, REGROUP is
 *   damped because FLEE should take over.
 * - `regroupArmorDamp`      — the damping factor used in that case.
 * - `patrolBaseline`        — small constant score for PATROL; the
 *   fallback any other goal must beat to be selected.
 * - `readinessArmorWeight`/`readinessShieldWeight` — combat readiness
 *   uses armor multiplicatively (a glass-cannon never reads as ready)
 *   and shield as a softer factor.
 */
export const DEFAULT_UTILITY_OPTIONS = Object.freeze({
  sensorRange: 800,
  engageBoost: 1.1,
  engageThreatPenalty: 0.5,
  fleeArmorWeight: 0.6,
  fleeThreatBase: 0.4,
  fleeThreatArmorWeight: 0.6,
  tradeThreatPower: 2,
  regroupBoost: 0.6,
  regroupArmorFloor: 0.4,
  regroupArmorDamp: 0.2,
  patrolBaseline: 0.15,
  readinessArmorWeight: 0.6,
  readinessShieldWeight: 0.4,
});

/**
 * Clamps a value to [0, 1].
 * @param {number} x - Raw score.
 * @returns {number} Bounded score.
 */
export function clamp01(x) {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/**
 * Maps distance to a [0, 1] proximity factor.
 * 1.0 at touch; 0.0 at and beyond `sensorRange`.
 *
 * @param {number} distance - Distance to the entity.
 * @param {number} sensorRange - Cutoff distance.
 * @returns {number} Proximity factor in [0, 1].
 */
export function proximityFactor(distance, sensorRange) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  if (!Number.isFinite(sensorRange) || sensorRange <= 0) return 0;
  if (distance >= sensorRange) return 0;
  return 1 - distance / sensorRange;
}

/**
 * Pressure from the single most-dangerous threat — `threat * proximity`.
 * Using the worst case (max), not the sum, keeps the scale in [0, 1]
 * regardless of how many far-away threats are in the snapshot.
 *
 * @param {Array} threats - List of `{ distance, threat }` entries.
 * @param {number} sensorRange - Cutoff distance for proximity.
 * @returns {number} Threat pressure in [0, 1].
 */
export function maxThreatPressure(threats, sensorRange) {
  if (!Array.isArray(threats) || threats.length === 0) return 0;
  let best = 0;
  for (const t of threats) {
    if (!t) continue;
    const level = Number.isFinite(t.threat) ? t.threat : 0;
    if (level <= 0) continue;
    const p = proximityFactor(t.distance, sensorRange) * level;
    if (p > best) best = p;
  }
  return best > 1 ? 1 : best;
}

/**
 * Best opportunity value — `value * proximity` over the supplied list.
 *
 * @param {Array} opportunities - Entries with `.distance` and `[valueKey]`.
 * @param {string} valueKey - Property holding the [0,1] desirability.
 * @param {number} sensorRange - Cutoff distance for proximity.
 * @returns {number} Best opportunity score in [0, 1].
 */
export function bestOpportunity(opportunities, valueKey, sensorRange) {
  if (!Array.isArray(opportunities) || opportunities.length === 0) return 0;
  let best = 0;
  for (const o of opportunities) {
    if (!o) continue;
    const v = Number.isFinite(o[valueKey]) ? o[valueKey] : 0;
    if (v <= 0) continue;
    const score = proximityFactor(o.distance, sensorRange) * v;
    if (score > best) best = score;
  }
  return best > 1 ? 1 : best;
}

/**
 * Combat readiness in [0, 1]. Armor is multiplicative (a glass-cannon
 * with armor 0.1 is never "ready" no matter its shields) while shield
 * acts as a softer multiplier on top.
 *
 * @param {Object} self - Normalized self state.
 * @param {Object} options - Tuning.
 * @returns {number} Readiness in [0, 1].
 */
export function combatReadiness(self, options) {
  const armor = clamp01(self.armor);
  const shield = clamp01(self.shield);
  return clamp01(
    armor *
      (options.readinessArmorWeight + options.readinessShieldWeight * shield),
  );
}

/**
 * Scores the ENGAGE goal. Requires a prey opportunity; rises with the
 * weakness and proximity of the best prey and with the agent's own
 * readiness; falls when threats are pressuring the agent.
 *
 * @param {Object} self - Normalized self state.
 * @param {Object} opportunities - `{ prey, trades }`; only `prey` is read.
 * @param {number} threatPressure - Pressure from `maxThreatPressure`.
 * @param {Object} options - Tuning.
 * @returns {number} ENGAGE score in [0, 1].
 */
export function scoreEngage(self, opportunities, threatPressure, options) {
  const prey = (opportunities && opportunities.prey) || [];
  if (prey.length === 0) return 0;
  const bestPrey = bestOpportunity(prey, "weakness", options.sensorRange);
  if (bestPrey <= 0) return 0;
  const readiness = combatReadiness(self, options);
  const threatPenalty = 1 - options.engageThreatPenalty * threatPressure;
  let score = clamp01(
    bestPrey * readiness * threatPenalty * options.engageBoost,
  );
  if (self.isVengeanceHunter) {
    score = Math.max(0.8, score); // highly aggressive combat bias
  }
  return score;
}

/**
 * Scores the FLEE goal. Rises sharply as armor drops (squared deficit)
 * and is amplified by threat pressure; a wounded agent fears any given
 * threat more than a healthy one.
 *
 * @param {Object} self - Normalized self state.
 * @param {number} threatPressure - Pressure from `maxThreatPressure`.
 * @param {Object} options - Tuning.
 * @returns {number} FLEE score in [0, 1].
 */
export function scoreFlee(self, threatPressure, options) {
  const armor = clamp01(self.armor);
  const armorPanic = (1 - armor) * (1 - armor);
  const armorTerm = armorPanic * options.fleeArmorWeight;
  const threatTerm =
    threatPressure *
    (options.fleeThreatBase + options.fleeThreatArmorWeight * armorPanic);
  let score = clamp01(armorTerm + threatTerm);
  if (self.isVengeanceHunter) {
    score /= 5; // fearless discipline
  }
  return score;
}

/**
 * Scores the TRADE goal. Requires a trade opportunity; rises with the
 * profit and proximity of the best trade; collapses sharply near
 * threats (trade is a peaceful activity).
 *
 * @param {Object} self - Normalized self state.
 * @param {Object} opportunities - `{ prey, trades }`; only `trades` is read.
 * @param {number} threatPressure - Pressure from `maxThreatPressure`.
 * @param {Object} options - Tuning.
 * @returns {number} TRADE score in [0, 1].
 */
export function scoreTrade(self, opportunities, threatPressure, options) {
  const trades = (opportunities && opportunities.trades) || [];
  if (trades.length === 0) return 0;
  const bestTrade = bestOpportunity(trades, "profit", options.sensorRange);
  if (bestTrade <= 0) return 0;
  const safe = 1 - threatPressure;
  const threatPenalty = Math.pow(safe < 0 ? 0 : safe, options.tradeThreatPower);
  return clamp01(bestTrade * threatPenalty);
}

/**
 * Scores the REGROUP goal — "step out of the fight to recharge".
 * Rises with shield deficit but is damped when armor is critical
 * (FLEE should take over there) or threats are nearby (no safe pause).
 *
 * @param {Object} self - Normalized self state.
 * @param {number} threatPressure - Pressure from `maxThreatPressure`.
 * @param {Object} options - Tuning.
 * @returns {number} REGROUP score in [0, 1].
 */
export function scoreRegroup(self, threatPressure, options) {
  const shield = clamp01(self.shield);
  const armor = clamp01(self.armor);
  const shieldNeed = 1 - shield;
  if (shieldNeed <= 0) return 0;
  const armorOK =
    armor >= options.regroupArmorFloor ? 1 : options.regroupArmorDamp;
  const safety = 1 - threatPressure;
  const safetyTerm = safety < 0 ? 0 : safety * safety;
  return clamp01(shieldNeed * armorOK * safetyTerm * options.regroupBoost);
}

/**
 * Scores the PATROL goal — a constant baseline so the agent has
 * something to do when no other goal scores higher.
 *
 * @param {Object} options - Tuning.
 * @returns {number} PATROL score in [0, 1].
 */
export function scorePatrol(options) {
  return clamp01(options.patrolBaseline);
}

/**
 * Defensive normalization for the `self` block — clamps each field
 * to [0,1] and supplies zeros for missing entries. Caller-supplied
 * snapshots are trusted in test code but boundary code (e.g. a Ship
 * with no max-energy module) may legitimately pass `NaN`.
 *
 * @param {Object} raw - Caller-supplied `self`.
 * @returns {{shield:number,armor:number,energy:number,cargoFill:number}}
 */
export function normalizeSelf(raw) {
  const r = raw || {};
  return {
    shield: clamp01(r.shield),
    armor: clamp01(r.armor),
    energy: clamp01(r.energy),
    cargoFill: clamp01(r.cargoFill),
  };
}

/**
 * Computes scores for every catalogued goal given a perception snapshot.
 * Pure function — does not mutate `perception` or `options`.
 *
 * @param {Object} perception - See module header for shape.
 * @param {Object} [options=DEFAULT_UTILITY_OPTIONS] - Tuning overrides.
 * @returns {Object} Map keyed by `Goals.*` of score in [0, 1].
 */
export function evaluateGoals(perception, options = DEFAULT_UTILITY_OPTIONS) {
  const merged = { ...DEFAULT_UTILITY_OPTIONS, ...options };
  const self = normalizeSelf(perception && perception.self);
  const threats = (perception && perception.threats) || [];
  const opps = (perception && perception.opportunities) || {};
  const threatPressure = maxThreatPressure(threats, merged.sensorRange);
  const isEscapeSecurity = !!(perception && perception.isTargetedBySecurity);
  return {
    [Goals.ESCAPE_SECURITY]: isEscapeSecurity ? 1.0 : 0.0,
    [Goals.ENGAGE]: scoreEngage(self, opps, threatPressure, merged),
    [Goals.FLEE]: scoreFlee(self, threatPressure, merged),
    [Goals.TRADE]: scoreTrade(self, opps, threatPressure, merged),
    [Goals.REGROUP]: scoreRegroup(self, threatPressure, merged),
    [Goals.PATROL]: scorePatrol(merged),
  };
}

/**
 * Returns the highest-scoring goal, its score, and the full score table.
 * Ties are broken by `GOAL_ORDER` (earlier entries win), guaranteeing
 * a deterministic result for identical inputs.
 *
 * @param {Object} perception - See module header for shape.
 * @param {Object} [options=DEFAULT_UTILITY_OPTIONS] - Tuning overrides.
 * @returns {{goal:string, score:number, scores:Object}}
 */
export function selectGoal(perception, options = DEFAULT_UTILITY_OPTIONS) {
  const scores = evaluateGoals(perception, options);
  let goal: string = Goals.PATROL;
  let score = -Infinity;
  for (const g of GOAL_ORDER) {
    if (scores[g] > score) {
      score = scores[g];
      goal = g;
    }
  }
  if (!Number.isFinite(score)) score = 0;
  return { goal, score, scores };
}

/**
 * Builds the `self` block of a perception snapshot from a Ship-like
 * object. Convenience helper for callers integrating with `AIController`;
 * the scoring functions themselves accept any duck-typed snapshot.
 *
 * @param {Object} ship - Ship-like with shield/armor/energy/cargo fields.
 * @returns {{shield:number,armor:number,energy:number,cargoFill:number,isVengeanceHunter:boolean}}
 */
export function selfStateFromShip(ship) {
  if (!ship)
    return {
      shield: 0,
      armor: 0,
      energy: 0,
      cargoFill: 0,
      isVengeanceHunter: false,
    };
  const safeFrac = (cur, max) => {
    if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return 0;
    return clamp01(cur / max);
  };
  let cargoUsed = 0;
  if (ship.cargo && typeof ship.cargo === "object") {
    for (const k of Object.keys(ship.cargo)) {
      const v = ship.cargo[k];
      if (Number.isFinite(v) && v > 0) cargoUsed += v;
    }
  }
  return {
    shield: safeFrac(ship.shield, ship.maxShield),
    armor: safeFrac(ship.armor, ship.maxArmor),
    energy: safeFrac(ship.energy, ship.maxEnergy),
    cargoFill: safeFrac(cargoUsed, ship.cargoCapacity),
    isVengeanceHunter: !!ship.isVengeanceHunter,
  };
}
