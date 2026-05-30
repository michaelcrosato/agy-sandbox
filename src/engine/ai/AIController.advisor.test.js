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
});
