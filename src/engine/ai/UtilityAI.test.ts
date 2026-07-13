import { describe, test, expect } from "vitest";
import {
  Goals,
  GOAL_ORDER,
  DEFAULT_UTILITY_OPTIONS,
  clamp01,
  proximityFactor,
  maxThreatPressure,
  bestOpportunity,
  combatReadiness,
  scoreEngage,
  scoreFlee,
  scoreTrade,
  scoreRegroup,
  scorePatrol,
  evaluateGoals,
  selectGoal,
  selfStateFromShip,
  normalizeSelf,
} from "./UtilityAI.js";
import { Ship } from "../Ship.js";

/**
 * Convenience: a "healthy" self snapshot at full strength with empty cargo.
 */
function healthySelf(overrides = {}) {
  return {
    shield: 1,
    armor: 1,
    energy: 1,
    cargoFill: 0,
    ...overrides,
  };
}

describe("UtilityAI primitives", () => {
  test("clamp01 bounds inputs to [0, 1] and rejects non-finite values", () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
    expect(clamp01(-Infinity)).toBe(0);
  });

  test("proximityFactor is 1 at touch, 0 at sensor edge and beyond", () => {
    expect(proximityFactor(0, 800)).toBe(1);
    expect(proximityFactor(400, 800)).toBeCloseTo(0.5, 10);
    expect(proximityFactor(800, 800)).toBe(0);
    expect(proximityFactor(1000, 800)).toBe(0);
    expect(proximityFactor(-5, 800)).toBe(0);
  });

  test("maxThreatPressure returns the worst single threat, not a sum", () => {
    const sensor = 800;
    const threats = [
      { distance: 400, threat: 1.0 }, // 0.5
      { distance: 100, threat: 0.5 }, // 0.4375
      { distance: 50, threat: 0.8 }, // ~0.75
    ];
    expect(maxThreatPressure(threats, sensor)).toBeCloseTo(0.75, 10);
  });

  test("maxThreatPressure handles empty/invalid input", () => {
    expect(maxThreatPressure([], 800)).toBe(0);
    expect(maxThreatPressure(null, 800)).toBe(0);
    expect(maxThreatPressure([{ distance: 100, threat: 0 }], 800)).toBe(0);
    expect(maxThreatPressure([{ distance: 2000, threat: 1 }], 800)).toBe(0); // out of range
  });

  test("bestOpportunity picks the highest value*proximity entry", () => {
    const opps = [
      { distance: 100, weakness: 0.5 }, // 0.4375
      { distance: 700, weakness: 1.0 }, // 0.125
      { distance: 200, weakness: 0.9 }, // 0.675
    ];
    expect(bestOpportunity(opps, "weakness", 800)).toBeCloseTo(0.675, 10);
  });

  test("combatReadiness is multiplicative in armor — glass-cannon reads low", () => {
    const opts = DEFAULT_UTILITY_OPTIONS;
    const glass = combatReadiness({ armor: 0.1, shield: 1, energy: 1 }, opts);
    const tank = combatReadiness({ armor: 1.0, shield: 0, energy: 0 }, opts);
    expect(glass).toBeLessThan(tank);
    expect(glass).toBeLessThan(0.2);
    expect(tank).toBeCloseTo(opts.readinessArmorWeight, 10);
  });
});

describe("UtilityAI individual goal scoring", () => {
  const opts = DEFAULT_UTILITY_OPTIONS;

  test("scoreEngage returns zero with no prey", () => {
    expect(scoreEngage(healthySelf(), { prey: [], trades: [] }, 0, opts)).toBe(
      0,
    );
    expect(scoreEngage(healthySelf(), undefined, 0, opts)).toBe(0);
  });

  test("scoreEngage rises with prey weakness and proximity", () => {
    const self = healthySelf();
    const weakClose = scoreEngage(
      self,
      { prey: [{ distance: 100, weakness: 0.9 }] },
      0,
      opts,
    );
    const weakFar = scoreEngage(
      self,
      { prey: [{ distance: 600, weakness: 0.9 }] },
      0,
      opts,
    );
    const toughClose = scoreEngage(
      self,
      { prey: [{ distance: 100, weakness: 0.2 }] },
      0,
      opts,
    );
    expect(weakClose).toBeGreaterThan(weakFar);
    expect(weakClose).toBeGreaterThan(toughClose);
    expect(weakClose).toBeLessThanOrEqual(1);
  });

  test("scoreEngage falls under threat pressure", () => {
    const self = healthySelf();
    const opps = { prey: [{ distance: 100, weakness: 0.9 }] };
    const calm = scoreEngage(self, opps, 0, opts);
    const pressured = scoreEngage(self, opps, 1, opts);
    expect(pressured).toBeLessThan(calm);
  });

  test("scoreFlee rises monotonically as armor drops", () => {
    const noThreat = 0;
    const fleeFull = scoreFlee({ armor: 1.0 }, noThreat, opts);
    const fleeMid = scoreFlee({ armor: 0.5 }, noThreat, opts);
    const fleeLow = scoreFlee({ armor: 0.2 }, noThreat, opts);
    const fleeCrit = scoreFlee({ armor: 0.05 }, noThreat, opts);
    expect(fleeFull).toBe(0);
    expect(fleeMid).toBeGreaterThan(fleeFull);
    expect(fleeLow).toBeGreaterThan(fleeMid);
    expect(fleeCrit).toBeGreaterThan(fleeLow);
  });

  test("scoreFlee rises with threat pressure and is amplified by armor panic", () => {
    const healthyAlarmed = scoreFlee({ armor: 1.0 }, 1.0, opts);
    const woundedSafe = scoreFlee({ armor: 0.1 }, 0, opts);
    const woundedAlarmed = scoreFlee({ armor: 0.1 }, 1.0, opts);
    // Wounded+alarmed must exceed both single-input cases.
    expect(woundedAlarmed).toBeGreaterThan(healthyAlarmed);
    expect(woundedAlarmed).toBeGreaterThan(woundedSafe);
  });

  test("scoreTrade requires a trade opportunity and collapses near threats", () => {
    const self = healthySelf();
    expect(scoreTrade(self, { trades: [] }, 0, opts)).toBe(0);
    const opps = { trades: [{ distance: 100, profit: 0.9 }] };
    const peaceful = scoreTrade(self, opps, 0, opts);
    const tense = scoreTrade(self, opps, 0.6, opts);
    const hostile = scoreTrade(self, opps, 1.0, opts);
    expect(peaceful).toBeGreaterThan(0);
    expect(tense).toBeLessThan(peaceful);
    expect(hostile).toBe(0);
  });

  test("scoreRegroup rewards shield-deficit + armor-OK + safety", () => {
    // Big shield deficit, intact armor, no threats.
    const restful = scoreRegroup(
      { shield: 0, armor: 0.8, energy: 0.5 },
      0,
      opts,
    );
    // Same shield deficit but armor is critical — REGROUP must drop sharply.
    const armorCritical = scoreRegroup(
      { shield: 0, armor: 0.1, energy: 0.5 },
      0,
      opts,
    );
    // Same shield deficit but a threat is breathing down our neck.
    const underFire = scoreRegroup(
      { shield: 0, armor: 0.8, energy: 0.5 },
      1.0,
      opts,
    );
    expect(restful).toBeGreaterThan(0);
    expect(restful).toBeLessThanOrEqual(opts.regroupBoost);
    expect(armorCritical).toBeLessThan(restful);
    expect(underFire).toBe(0);
  });

  test("scoreRegroup is zero when shields are full", () => {
    expect(scoreRegroup({ shield: 1, armor: 1, energy: 1 }, 0, opts)).toBe(0);
  });

  test("scorePatrol returns the configured constant baseline", () => {
    expect(scorePatrol(opts)).toBe(opts.patrolBaseline);
    expect(scorePatrol({ ...opts, patrolBaseline: 0.3 })).toBe(0.3);
  });
});

describe("UtilityAI selectGoal — representative situations", () => {
  test("healthy agent with weak prey nearby selects ENGAGE", () => {
    const perception = {
      self: healthySelf(),
      threats: [],
      opportunities: {
        prey: [{ distance: 200, weakness: 0.9 }],
        trades: [],
      },
    };
    const { goal, score, scores } = selectGoal(perception);
    expect(goal).toBe(Goals.ENGAGE);
    expect(score).toBeGreaterThan(scores[Goals.PATROL]);
    expect(scores[Goals.FLEE]).toBe(0);
  });

  test("critical armor with a close threat selects FLEE — even if prey is available", () => {
    const perception = {
      self: { shield: 0.2, armor: 0.08, energy: 0.5, cargoFill: 0 },
      threats: [{ distance: 120, threat: 0.9 }],
      opportunities: {
        prey: [{ distance: 100, weakness: 0.9 }], // tempting prey
        trades: [{ distance: 150, profit: 0.9 }],
      },
    };
    const { goal, scores } = selectGoal(perception);
    expect(goal).toBe(Goals.FLEE);
    expect(scores[Goals.FLEE]).toBeGreaterThan(scores[Goals.ENGAGE]);
    expect(scores[Goals.FLEE]).toBeGreaterThan(scores[Goals.TRADE]);
  });

  test("idle perception (no threats, no opportunities) falls back to PATROL", () => {
    const perception = {
      self: healthySelf(),
      threats: [],
      opportunities: { prey: [], trades: [] },
    };
    const { goal, score } = selectGoal(perception);
    expect(goal).toBe(Goals.PATROL);
    expect(score).toBe(DEFAULT_UTILITY_OPTIONS.patrolBaseline);
  });

  test("safe agent with a juicy trade nearby selects TRADE", () => {
    const perception = {
      self: healthySelf({ cargoFill: 0.1 }),
      threats: [],
      opportunities: {
        prey: [],
        trades: [{ distance: 150, profit: 0.95 }],
      },
    };
    const { goal, scores } = selectGoal(perception);
    expect(goal).toBe(Goals.TRADE);
    expect(scores[Goals.TRADE]).toBeGreaterThan(scores[Goals.PATROL]);
  });

  test("low shields, healthy armor, no threats — selects REGROUP", () => {
    const perception = {
      self: { shield: 0.05, armor: 0.9, energy: 0.6, cargoFill: 0 },
      threats: [],
      opportunities: { prey: [], trades: [] },
    };
    const { goal, scores } = selectGoal(perception);
    expect(goal).toBe(Goals.REGROUP);
    expect(scores[Goals.REGROUP]).toBeGreaterThan(scores[Goals.PATROL]);
    expect(scores[Goals.FLEE]).toBeLessThan(scores[Goals.REGROUP]);
  });

  test("healthy agent with only a tough far-away prey still prefers PATROL", () => {
    // Engagement score must be small enough that an unrewarding fight loses to
    // the baseline — guards against ENGAGE always winning when prey exists.
    const perception = {
      self: healthySelf(),
      threats: [],
      opportunities: {
        prey: [{ distance: 700, weakness: 0.1 }],
        trades: [],
      },
    };
    const { goal, scores } = selectGoal(perception);
    expect(scores[Goals.ENGAGE]).toBeLessThan(scores[Goals.PATROL]);
    expect(goal).toBe(Goals.PATROL);
  });

  test("threat-saturated perception with no opportunities still flees", () => {
    const perception = {
      self: { shield: 0.5, armor: 0.6, energy: 0.5, cargoFill: 0 },
      threats: [
        { distance: 80, threat: 1.0 },
        { distance: 300, threat: 0.8 },
      ],
      opportunities: { prey: [], trades: [] },
    };
    const { goal, scores } = selectGoal(perception);
    expect(goal).toBe(Goals.FLEE);
    expect(scores[Goals.FLEE]).toBeGreaterThan(scores[Goals.PATROL]);
  });
});

describe("UtilityAI determinism and tunability", () => {
  test("same perception produces identical results across repeated calls", () => {
    const perception = {
      self: { shield: 0.7, armor: 0.4, energy: 0.6, cargoFill: 0.2 },
      threats: [{ distance: 250, threat: 0.6 }],
      opportunities: {
        prey: [{ distance: 200, weakness: 0.5 }],
        trades: [{ distance: 400, profit: 0.7 }],
      },
    };
    const a = selectGoal(perception);
    const b = selectGoal(perception);
    expect(a).toEqual(b);
  });

  test("evaluateGoals does not mutate its inputs", () => {
    const perception = Object.freeze({
      self: Object.freeze({
        shield: 0.5,
        armor: 0.5,
        energy: 0.5,
        cargoFill: 0,
      }),
      threats: Object.freeze([Object.freeze({ distance: 200, threat: 0.5 })]),
      opportunities: Object.freeze({
        prey: Object.freeze([Object.freeze({ distance: 200, weakness: 0.5 })]),
        trades: Object.freeze([]),
      }),
    });
    expect(() => evaluateGoals(perception)).not.toThrow();
  });

  test("ties are broken by GOAL_ORDER — earlier entries win", () => {
    // Force every goal to score 0; PATROL is the only one >0, so it wins.
    // Then zero out PATROL and ensure deterministic earliest-wins behavior.
    const perception = {
      self: healthySelf(),
      threats: [],
      opportunities: { prey: [], trades: [] },
    };
    const noPatrol = selectGoal(perception, { patrolBaseline: 0 });
    // All scores are exactly 0 → first goal in GOAL_ORDER (ENGAGE) wins.
    expect(noPatrol.goal).toBe(GOAL_ORDER[0]);
    expect(noPatrol.score).toBe(0);
  });

  test("raising patrolBaseline lets PATROL beat a weak ENGAGE option", () => {
    const perception = {
      self: healthySelf(),
      threats: [],
      opportunities: {
        prey: [{ distance: 400, weakness: 0.3 }], // mediocre prey
        trades: [],
      },
    };
    const sharpHunter = selectGoal(perception, { patrolBaseline: 0.05 });
    const lazyHunter = selectGoal(perception, { patrolBaseline: 0.5 });
    expect(sharpHunter.goal).toBe(Goals.ENGAGE);
    expect(lazyHunter.goal).toBe(Goals.PATROL);
  });

  test("partial option overrides merge with DEFAULT_UTILITY_OPTIONS", () => {
    const perception = {
      self: healthySelf(),
      threats: [],
      opportunities: { prey: [], trades: [] },
    };
    const r = selectGoal(perception, { patrolBaseline: 0.42 });
    expect(r.scores[Goals.PATROL]).toBe(0.42);
    // Default sensorRange is still in effect — verify by adding an in-range
    // threat that would only register under the default 800 sensor.
    const r2 = selectGoal(
      { ...perception, threats: [{ distance: 500, threat: 1 }] },
      { patrolBaseline: 0.42 },
    );
    expect(r2.scores[Goals.FLEE]).toBeGreaterThan(0);
  });

  test("DEFAULT_UTILITY_OPTIONS is frozen so callers cannot mutate the shared defaults", () => {
    expect(Object.isFrozen(DEFAULT_UTILITY_OPTIONS)).toBe(true);
  });
});

describe("UtilityAI helpers — selfStateFromShip and normalizeSelf", () => {
  test("normalizeSelf clamps all fields to [0, 1] and defaults missing fields to 0", () => {
    expect(normalizeSelf({})).toEqual({
      shield: 0,
      armor: 0,
      energy: 0,
      cargoFill: 0,
    });
    expect(
      normalizeSelf({ shield: 2, armor: -1, energy: 0.7, cargoFill: NaN }),
    ).toEqual({
      shield: 1,
      armor: 0,
      energy: 0.7,
      cargoFill: 0,
    });
  });

  test("selfStateFromShip normalizes a fresh Ship to full health and empty cargo", () => {
    const ship = new Ship({ name: "Test" });
    const self = selfStateFromShip(ship);
    expect(self.shield).toBe(1);
    expect(self.armor).toBe(1);
    expect(self.energy).toBe(1);
    expect(self.cargoFill).toBe(0);
  });

  test("selfStateFromShip reports a wounded ship's normalized state", () => {
    const ship = new Ship({ name: "Wounded" });
    ship.shield = ship.maxShield * 0.25;
    ship.armor = ship.maxArmor * 0.5;
    ship.energy = ship.maxEnergy * 0.6;
    ship.cargo.food = 5;
    ship.cargo.minerals = 5;
    const self = selfStateFromShip(ship);
    expect(self.shield).toBeCloseTo(0.25, 10);
    expect(self.armor).toBeCloseTo(0.5, 10);
    expect(self.energy).toBeCloseTo(0.6, 10);
    expect(self.cargoFill).toBeCloseTo((5 + 5) / ship.cargoCapacity, 10);
  });

  test("selfStateFromShip is safe against missing inputs", () => {
    expect(selfStateFromShip(null)).toEqual({
      shield: 0,
      armor: 0,
      energy: 0,
      cargoFill: 0,
      isVengeanceHunter: false,
    });
    expect(selfStateFromShip({})).toEqual({
      shield: 0,
      armor: 0,
      energy: 0,
      cargoFill: 0,
      isVengeanceHunter: false,
    });
  });
});
