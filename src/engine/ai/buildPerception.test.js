import {
  buildPerception,
  defaultIsThreat,
  defaultIsPrey,
} from "./buildPerception.js";
import { selectGoal, Goals } from "./UtilityAI.js";

/** A Vector2D-lite with the `.distance` method buildPerception relies on. */
function pos(x, y) {
  return {
    x,
    y,
    distance(o) {
      return Math.hypot(this.x - o.x, this.y - o.y);
    },
  };
}

function ship(overrides = {}) {
  return {
    type: "ship",
    id: "self",
    role: "merchant",
    position: pos(0, 0),
    shield: 100,
    maxShield: 100,
    armor: 100,
    maxArmor: 100,
    energy: 100,
    maxEnergy: 100,
    cargo: {},
    cargoCapacity: 100,
    ...overrides,
  };
}

function pirate(overrides = {}) {
  return ship({
    id: "p1",
    role: "pirate",
    name: "Pirate Raider",
    position: pos(100, 0),
    ...overrides,
  });
}

function planet(overrides = {}) {
  return { type: "planet", id: "pl1", position: pos(120, 0), ...overrides };
}

describe("buildPerception — self block", () => {
  it("derives normalized self fractions from the ship", () => {
    const p = buildPerception(ship({ armor: 50, shield: 25 }), []);
    expect(p.self.armor).toBeCloseTo(0.5);
    expect(p.self.shield).toBeCloseTo(0.25);
    expect(p.threats).toEqual([]);
    expect(p.opportunities).toEqual({ prey: [], trades: [] });
  });
});

describe("buildPerception — threats", () => {
  it("a merchant sees a nearby pirate as a threat", () => {
    const p = buildPerception(ship(), [pirate()]);
    expect(p.threats).toHaveLength(1);
    expect(p.threats[0].distance).toBeCloseTo(100);
    expect(p.threats[0].threat).toBeGreaterThan(0);
    expect(p.opportunities.prey).toEqual([]);
  });

  it("ignores entities beyond sensor range", () => {
    const p = buildPerception(ship(), [pirate({ position: pos(5000, 0) })]);
    expect(p.threats).toEqual([]);
  });

  it("a pirate sees a guard as a threat; a merchant does not", () => {
    const guard = ship({ id: "g1", role: "guard", position: pos(80, 0) });
    expect(buildPerception(pirate(), [guard]).threats).toHaveLength(1);
    expect(buildPerception(ship(), [guard]).threats).toEqual([]);
  });

  it("a destroyed pirate is not a threat", () => {
    const p = buildPerception(ship(), [pirate({ isDestroyed: true })]);
    expect(p.threats).toEqual([]);
  });
});

describe("buildPerception — prey & trades", () => {
  it("a pirate sees a merchant as prey; a merchant does not hunt", () => {
    const merchant = ship({ id: "m1", position: pos(150, 0) });
    expect(
      buildPerception(pirate(), [merchant]).opportunities.prey,
    ).toHaveLength(1);
    expect(buildPerception(ship(), [merchant]).opportunities.prey).toEqual([]);
  });

  it("a pirate does not prey on its own faction", () => {
    const ally = ship({ id: "m2", faction: "Crimson", position: pos(150, 0) });
    const raider = pirate({ faction: "Crimson" });
    expect(buildPerception(raider, [ally]).opportunities.prey).toEqual([]);
  });

  it("a merchant sees a planet as a trade; a pirate does not", () => {
    expect(
      buildPerception(ship(), [planet()]).opportunities.trades,
    ).toHaveLength(1);
    expect(buildPerception(pirate(), [planet()]).opportunities.trades).toEqual(
      [],
    );
  });
});

describe("buildPerception — overridable classifiers", () => {
  it("honors a custom isThreat predicate (faction-aware callers)", () => {
    const friendly = ship({ id: "f1", role: "pirate", position: pos(50, 0) });
    const p = buildPerception(ship(), [friendly], {
      isThreat: () => false,
    });
    expect(p.threats).toEqual([]);
  });

  it("exports usable default predicates", () => {
    expect(defaultIsThreat(pirate(), ship())).toBe(true);
    expect(defaultIsPrey(ship({ id: "m1" }), pirate())).toBe(true);
  });
});

describe("buildPerception → selectGoal integration (the showcase)", () => {
  it("a merchant FLEES when a pirate appears, but PATROLS when alone", () => {
    const underThreat = selectGoal(buildPerception(ship(), [pirate()]));
    expect(underThreat.goal).toBe(Goals.FLEE);

    const alone = selectGoal(buildPerception(ship(), []));
    expect(alone.goal).toBe(Goals.PATROL);
  });

  it("a merchant TRADES toward a nearby safe planet", () => {
    const calm = selectGoal(buildPerception(ship(), [planet()]));
    expect(calm.goal).toBe(Goals.TRADE);
  });

  it("a pirate ENGAGES a nearby merchant", () => {
    const merchant = ship({ id: "m1", position: pos(120, 0) });
    const hunt = selectGoal(buildPerception(pirate(), [merchant]));
    expect(hunt.goal).toBe(Goals.ENGAGE);
  });

  it("the same merchant changes plan TRADE→FLEE when a pirate enters the scene", () => {
    const calm = selectGoal(buildPerception(ship(), [planet()]));
    const danger = selectGoal(buildPerception(ship(), [planet(), pirate()]));
    expect(calm.goal).toBe(Goals.TRADE);
    expect(danger.goal).toBe(Goals.FLEE);
  });
});
