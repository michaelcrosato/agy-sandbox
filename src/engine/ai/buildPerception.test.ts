import { describe, it, expect } from "vitest";
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

describe("buildPerception — SPEC-087 Standings-Aware Dynamic Trade Profit spreads", () => {
  it("factors FactionRegistry price modifiers, taxes, and black market premiums into dynamic spreads", () => {
    const mockRegistry = {
      priceModifier(playerId, faction, mode) {
        if (faction === "Allies") {
          return mode === "buy" ? 0.8 : 1.2;
        }
        if (faction === "Enemies") {
          return mode === "buy" ? 1.3 : 0.7;
        }
        return 1.0;
      },
      getStanding(playerId, faction) {
        if (faction === "Allies") return 80;
        if (faction === "Enemies") return -50;
        return 0;
      },
    };

    const originPlanet = planet({
      name: "Sol Prime",
      faction: "Allies",
      market: { food: 100 },
    });

    const destPlanet = planet({
      id: "pl2",
      name: "Draconis",
      faction: "Enemies",
      market: { food: 200 },
    });

    // Case A: Default calculation without faction registry (flat absolute price difference)
    // maxSpread = |200 - 100| = 100.
    const pNormal = buildPerception(ship(), [originPlanet, destPlanet]);
    const scoreNormal = pNormal.opportunities.trades[0].profit;

    // Case B: With faction registry (standings-aware)
    // buyPrice at Allies: 100 * 0.8 = 80
    // sellPrice at Enemies: 200 * 0.7 = 140
    // Enemies tax rate: standing is -50 <= -16, so 15% transaction tax applies.
    // sellPrice net: 140 * 0.85 = 119
    // maxSpread = 119 - 80 = 39.
    // Since 39 < 100, the margin is smaller, so the score should be lower than Case A!
    const pRegistry = buildPerception(
      ship({ id: "s1" }),
      [originPlanet, destPlanet],
      {
        factionRegistry: mockRegistry,
      },
    );
    const scoreRegistry = pRegistry.opportunities.trades[0].profit;
    expect(scoreRegistry).toBeLessThan(scoreNormal);

    // Case C: Contraband at Black Market premium (1.5x)
    const blackMarketPlanet = planet({
      id: "pl3",
      name: "Rogue's Hollow",
      faction: "Independents",
      services: { blackMarket: true },
      market: { contraband: 200 },
    });

    const originContraband = planet({
      name: "Kaelis",
      faction: "Independents",
      market: { contraband: 50 },
    });

    // Without black market premium: spread = 200 - 50 = 150
    const pNoPremium = buildPerception(ship(), [
      originContraband,
      planet({
        id: "pl4",
        faction: "Independents",
        market: { contraband: 200 },
      }),
    ]);
    const scoreNoPremium = pNoPremium.opportunities.trades[0].profit;

    // With black market premium: sellPrice = 200 * 1.5 = 300. spread = 300 - 50 = 250!
    // Since spread is larger, tradeProfit should be higher!
    const pPremium = buildPerception(ship(), [
      originContraband,
      blackMarketPlanet,
    ]);
    const scorePremium = pPremium.opportunities.trades[0].profit;
    expect(scorePremium).toBeGreaterThan(scoreNoPremium);
  });
});
