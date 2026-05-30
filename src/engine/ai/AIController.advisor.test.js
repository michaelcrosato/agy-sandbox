import { AIController } from "./AIController.js";
import { Goals } from "./UtilityAI.js";

// Spec 017 — the advisory UtilityAI layer. These exercise the new
// `useUtilityAdvisor` path; the legacy role-FSM behaviour is covered by the
// untouched AIController.test.js (which never sets the flag, so it stays off).

function pos(x, y) {
  return {
    x,
    y,
    distance(o) {
      return Math.hypot(this.x - o.x, this.y - o.y);
    },
  };
}

function makeShip(overrides = {}) {
  return {
    id: "self",
    type: "ship",
    role: "merchant",
    position: pos(0, 0),
    heading: 0,
    velocity: { magnitude: () => 0 },
    controls: {},
    isDestroyed: false,
    isDisabled: false,
    shield: 100,
    maxShield: 100,
    armor: 100,
    maxArmor: 100,
    energy: 100,
    maxEnergy: 100,
    cargo: {},
    cargoCapacity: 100,
    clearControls() {
      this.controls = {};
    },
    ...overrides,
  };
}

function pirate(overrides = {}) {
  return makeShip({
    id: "p1",
    role: "pirate",
    name: "Pirate Raider",
    position: pos(100, 0),
    ...overrides,
  });
}

describe("AIController advisory layer (spec 017)", () => {
  it("a merchant FLEES and evades when a pirate appears", () => {
    const ship = makeShip();
    const ai = new AIController(ship, "merchant", { useUtilityAdvisor: true });

    ai.update(0.1, [ship, pirate()]);

    expect(ai.currentGoal).toBe(Goals.FLEE);
    expect(ship.controls.isThrusting).toBe(true); // burning away
  });

  it("the SAME merchant changes plan when the world changes", () => {
    const ship = makeShip();
    const ai = new AIController(ship, "merchant", { useUtilityAdvisor: true });

    ai.update(0.1, [ship, pirate()]);
    const underThreat = ai.currentGoal;

    ai.update(0.1, [ship]); // pirate gone
    const alone = ai.currentGoal;

    expect(underThreat).toBe(Goals.FLEE);
    expect(alone).toBe(Goals.PATROL);
    expect(alone).not.toBe(underThreat);
  });

  it("steers away from the threat, not toward it", () => {
    // Pirate dead ahead (+x); fleeing should rotate the ship off that bearing.
    const ship = makeShip({ heading: 0 });
    const ai = new AIController(ship, "merchant", { useUtilityAdvisor: true });

    ai.update(0.1, [ship, pirate({ position: pos(200, 0) })]);

    expect(ai.currentGoal).toBe(Goals.FLEE);
    // Facing the threat (+x) while the flee target is behind (-x) ⇒ it turns.
    const turning =
      ship.controls.isTurningLeft || ship.controls.isTurningRight || false;
    expect(turning).toBe(true);
    expect(ship.controls.isThrusting).toBe(true);
  });

  it("a wounded pirate breaks off to FLEE a guard instead of hunting", () => {
    const woundedPirate = pirate({ armor: 20, position: pos(0, 0) });
    const guard = makeShip({ id: "g1", role: "guard", position: pos(120, 0) });
    const ai = new AIController(woundedPirate, "pirate", {
      useUtilityAdvisor: true,
    });

    ai.update(0.1, [woundedPirate, guard]);

    expect(ai.currentGoal).toBe(Goals.FLEE);
    expect(woundedPirate.controls.isThrusting).toBe(true);
  });

  it("a healthy pirate still ENGAGES prey (non-FLEE falls through to the FSM)", () => {
    const raider = pirate({ position: pos(0, 0) });
    const merchant = makeShip({ id: "m1", position: pos(150, 0) });
    const ai = new AIController(raider, "pirate", { useUtilityAdvisor: true });

    ai.update(0.1, [raider, merchant]);

    expect(ai.currentGoal).toBe(Goals.ENGAGE);
    // The legacy pirate FSM took over: it locked the merchant as its target.
    expect(ai.target).toBe(merchant);
  });

  it("is inert by default — no advisor, no currentGoal, legacy behaviour", () => {
    const ship = makeShip();
    const ai = new AIController(ship, "merchant"); // no options ⇒ advisor off

    expect(ai.useUtilityAdvisor).toBe(false);
    ai.update(0.1, [ship, pirate()]);
    expect(ai.currentGoal).toBeNull(); // advisor never ran
  });

  it("a damaged guard chooses to REGROUP to recharge shields", () => {
    const woundedGuard = makeShip({
      id: "g1",
      role: "guard",
      shield: 0,
      maxShield: 100,
      armor: 100,
      maxArmor: 100,
      position: pos(0, 0),
    });
    const pirateThreat = pirate({ position: pos(600, 0) });
    const ai = new AIController(woundedGuard, "guard", {
      useUtilityAdvisor: true,
    });

    ai.update(0.1, [woundedGuard, pirateThreat]);

    expect(ai.currentGoal).toBe(Goals.REGROUP);
    expect(woundedGuard.controls.isThrusting).toBe(true);
  });

  it("a merchant chooses to TRADE and steer toward a safe nearby planet", () => {
    const merchant = makeShip({ position: pos(0, 0) });
    const safePlanet = {
      id: "p1",
      type: "planet",
      position: pos(300, 300),
      landingRadius: 50,
    };
    const ai = new AIController(merchant, "merchant", {
      useUtilityAdvisor: true,
    });

    ai.update(0.1, [merchant, safePlanet]);

    expect(ai.currentGoal).toBe(Goals.TRADE);
    expect(ai.destination).toBe(safePlanet.position);
    expect(merchant.controls.isThrusting).toBe(true);
  });

  it("a merchant trades and brakes when close to a planet", () => {
    const merchant = makeShip({ position: pos(0, 0) });
    const closePlanet = {
      id: "p1",
      type: "planet",
      position: pos(20, 20),
      landingRadius: 50,
    };
    const ai = new AIController(merchant, "merchant", {
      useUtilityAdvisor: true,
    });

    ai.update(0.1, [merchant, closePlanet]);

    expect(ai.currentGoal).toBe(Goals.TRADE);
    expect(merchant.controls.isBraking).toBe(true);
    expect(merchant.controls.isThrusting).toBeFalsy();
  });

  it("a pirate with advisor prefers the highest-weakness prey over the nearest prey", () => {
    const raider = pirate({ position: pos(0, 0) });
    const healthyPrey = makeShip({
      id: "healthy",
      position: pos(100, 0),
      armor: 100,
      maxArmor: 100,
    });
    const woundedPrey = makeShip({
      id: "wounded",
      position: pos(200, 0),
      armor: 10,
      maxArmor: 100,
    });
    const ai = new AIController(raider, "pirate", { useUtilityAdvisor: true });

    // Both are soft non-pirates and valid targets
    ai.update(0.1, [raider, healthyPrey, woundedPrey]);

    // Raider has ENGAGE goal and selects the wounded prey even though it is twice as far!
    expect(ai.currentGoal).toBe(Goals.ENGAGE);
    expect(ai.target.id).toBe("wounded");
  });

  it("a damaged ship in REGROUP retreats from close threats or holds still to recharge when safe", () => {
    const woundedGuard = makeShip({
      id: "g1",
      role: "guard",
      shield: 0,
      maxShield: 100,
      armor: 100,
      maxArmor: 100,
      position: pos(0, 0),
    });
    const ai = new AIController(woundedGuard, "guard", {
      useUtilityAdvisor: true,
    });

    // 1. With a threat at a safe distance, it should choose REGROUP and retreat (thrusting)
    const pirateThreat = pirate({ position: pos(600, 0) });
    ai.update(0.1, [woundedGuard, pirateThreat]);
    expect(ai.currentGoal).toBe(Goals.REGROUP);
    expect(woundedGuard.controls.isThrusting).toBe(true);

    // 2. In a safe zone, it brakes to hold position and recharge
    woundedGuard.clearControls();
    ai.update(0.1, [woundedGuard]); // threat is gone
    expect(ai.currentGoal).toBe(Goals.REGROUP);
    expect(woundedGuard.controls.isBraking).toBe(true);
    expect(woundedGuard.controls.isThrusting).toBeFalsy();
  });

  it("a merchant in TRADE chooses the most profitable planet from local market spreads", () => {
    const merchant = makeShip({ position: pos(0, 0) });

    // Planet A: no commodities in market (no spread)
    const planetA = {
      id: "pA",
      type: "planet",
      position: pos(100, 100),
      market: {},
      landingRadius: 50,
    };

    // Planet B: large price spread (highly profitable) with Planet C
    const planetB = {
      id: "pB",
      type: "planet",
      position: pos(150, 150),
      market: { food: 500 },
      landingRadius: 50,
    };

    // Planet C: far away planet to establish the spread
    const planetC = {
      id: "pC",
      type: "planet",
      position: pos(1000, 1000),
      market: { food: 100 },
      landingRadius: 50,
    };

    const ai = new AIController(merchant, "merchant", {
      useUtilityAdvisor: true,
    });

    ai.update(0.1, [merchant, planetA, planetB, planetC]);

    expect(ai.currentGoal).toBe(Goals.TRADE);
    // Should target planetB because of the massive profit spread, despite being slightly further!
    expect(ai.destination).toBe(planetB.position);
  });

  it("a pirate attacker using the advisor targets the weaker threat in ENGAGE", () => {
    const raider = pirate({
      id: "p1",
      position: pos(0, 0),
    });
    const healthyThreat = makeShip({
      id: "healthy-merchant",
      position: pos(100, 0),
      shield: 100,
      maxShield: 100,
      armor: 100,
      maxArmor: 100,
    });
    const woundedThreat = makeShip({
      id: "wounded-merchant",
      position: pos(200, 0),
      shield: 10,
      maxShield: 100,
      armor: 20,
      maxArmor: 100,
    });
    const ai = new AIController(raider, "pirate", { useUtilityAdvisor: true });

    ai.update(0.1, [raider, healthyThreat, woundedThreat]);

    expect(ai.currentGoal).toBe(Goals.ENGAGE);
    expect(ai.target.id).toBe("wounded-merchant");
  });

  it("hardens buildPerception to gracefully bypass null, non-ship, or storm entities", () => {
    const ship = makeShip();
    const ai = new AIController(ship, "merchant", { useUtilityAdvisor: true });
    
    // Simulate list containing invalid/incomplete entities
    const entities = [
      ship,
      null,
      undefined,
      { type: "cargo_pod", position: pos(50, 50) },
      { type: "cosmic_storm", hazardType: "radioactive_cloud", position: null }, // null position storm
      { type: "cosmic_storm", hazardType: "radioactive_cloud", position: pos(0, 0), radius: undefined }, // undefined radius storm
    ];

    expect(() => ai.update(0.1, entities)).not.toThrow();
  });
});
