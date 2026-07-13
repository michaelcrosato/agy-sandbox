import { describe, test, expect } from "vitest";
import {
  PLANET_PROFILES,
  DEFAULT_PRODUCTION_OPTIONS,
  computeCommodityPressure,
  applyProductionPulse,
} from "./ProductionModel.js";
import { GalaxyHeartbeat } from "./GalaxyHeartbeat.js";
import { AIController } from "./ai/AIController.js";
import { Vector2D } from "../physics/Vector2D.js";

function planet(name, market) {
  return { name, market: { ...market } };
}

describe("ProductionModel.computeCommodityPressure", () => {
  const opts = {
    productionRate: 0.02,
    consumptionRate: 0.02,
    minFactor: 0.4,
    maxFactor: 2.5,
  };

  test("producer-only pressure pushes price downward by rate * baseline", () => {
    const next = computeCommodityPressure(100, 100, 1, 0, opts);
    expect(next).toBeCloseTo(98, 10); // 100 + 100 * (0 - 1 * 0.02) = 98
  });

  test("consumer-only pressure pushes price upward by rate * baseline", () => {
    const next = computeCommodityPressure(100, 100, 0, 1, opts);
    expect(next).toBeCloseTo(102, 10);
  });

  test("equal producer and consumer strengths cancel out", () => {
    const next = computeCommodityPressure(150, 100, 1, 1, opts);
    expect(next).toBeCloseTo(150, 10);
  });

  test("never falls below minFactor * baseline", () => {
    // current already at the floor; producer cannot push lower.
    const next = computeCommodityPressure(40, 100, 5, 0, opts);
    expect(next).toBe(40);
  });

  test("never rises above maxFactor * baseline", () => {
    const next = computeCommodityPressure(250, 100, 0, 5, opts);
    expect(next).toBe(250);
  });
});

describe("ProductionModel.applyProductionPulse", () => {
  const opts = DEFAULT_PRODUCTION_OPTIONS;

  test("producer commodity decreases on a single pulse", () => {
    const p = planet("Farm", { food: 100, electronics: 200 });
    const profile = { produces: { food: 1 } };
    const changed = applyProductionPulse(
      p,
      profile,
      { food: 100, electronics: 200 },
      opts,
    );
    expect(p.market.food).toBe(98);
    expect(p.market.electronics).toBe(200); // untouched
    expect(changed).toEqual(["food"]);
  });

  test("consumer commodity increases on a single pulse", () => {
    const p = planet("Forge", { minerals: 100 });
    const profile = { consumes: { minerals: 1 } };
    applyProductionPulse(p, profile, { minerals: 100 }, opts);
    expect(p.market.minerals).toBe(102);
  });

  test("ignores commodities missing from the market or baseline", () => {
    const p = planet("Sparse", { food: 100 });
    const profile = {
      produces: { food: 1, machinery: 1 }, // machinery not in market
      consumes: { unobtainium: 1 }, // not in market or baseline
    };
    const baseline = { food: 100 }; // machinery & unobtainium absent
    const changed = applyProductionPulse(p, profile, baseline, opts);
    expect(changed).toEqual(["food"]);
    expect(p.market.food).toBe(98);
    expect(p.market.machinery).toBeUndefined();
  });

  test("returns empty change list when profile has no effect this pulse", () => {
    const p = planet("Stable", { food: 100 });
    const profile = {}; // no produces/consumes
    const changed = applyProductionPulse(p, profile, { food: 100 }, opts);
    expect(changed).toEqual([]);
    expect(p.market.food).toBe(100);
  });

  test("repeated pulses drive a producer commodity to its floor and clamp", () => {
    const p = planet("Megafarm", { food: 100 });
    const profile = { produces: { food: 1 } };
    const baseline = { food: 100 };
    for (let i = 0; i < 500; i++) {
      applyProductionPulse(p, profile, baseline, opts);
    }
    const floor = Math.round(100 * opts.minFactor); // 40
    expect(p.market.food).toBe(floor);
  });

  test("repeated pulses drive a consumer commodity to its ceiling and clamp", () => {
    const p = planet("Industry", { electronics: 100 });
    const profile = { consumes: { electronics: 1 } };
    const baseline = { electronics: 100 };
    for (let i = 0; i < 500; i++) {
      applyProductionPulse(p, profile, baseline, opts);
    }
    const ceiling = Math.round(100 * opts.maxFactor); // 250
    expect(p.market.electronics).toBe(ceiling);
  });

  test("function is deterministic — identical inputs yield identical mutations", () => {
    const a = planet("X", { food: 100, electronics: 200 });
    const b = planet("X", { food: 100, electronics: 200 });
    const profile = { produces: { food: 1 }, consumes: { electronics: 0.5 } };
    const baseline = { food: 100, electronics: 200 };
    for (let i = 0; i < 25; i++) {
      applyProductionPulse(a, profile, baseline, opts);
      applyProductionPulse(b, profile, baseline, opts);
    }
    expect(a.market).toEqual(b.market);
  });
});

describe("ProductionModel chain coupling (spec 018)", () => {
  const opts = DEFAULT_PRODUCTION_OPTIONS;
  // An industrial refinery: produces minerals, refined from raw ore input.
  const refinery = {
    produces: { minerals: 1 },
    consumes: { ore: 1 },
    refines: { minerals: "ore" },
  };
  const baseline = { ore: 100, minerals: 200 };

  test("cheap input ore boosts the refined output's downward pressure", () => {
    const cheap = planet("Cheap", { ore: 50, minerals: 200 });
    const scarce = planet("Scarce", { ore: 150, minerals: 200 });
    applyProductionPulse(cheap, refinery, baseline, opts);
    applyProductionPulse(scarce, refinery, baseline, opts);
    // Abundant ore → stronger minerals production → minerals price falls further
    // than when ore is scarce. This is the upstream→downstream propagation.
    expect(cheap.market.minerals).toBeLessThan(scarce.market.minerals);
  });

  test("a sustained ore surplus drags refined minerals well below baseline", () => {
    const p = planet("Refinery", { ore: 40, minerals: 200 });
    for (let i = 0; i < 25; i++) {
      p.market.ore = 40; // external supply keeps ore abundant each pulse
      applyProductionPulse(p, refinery, baseline, opts);
    }
    expect(p.market.minerals).toBeLessThan(180);
  });

  test("scarce input ore throttles refined production (no boost below baseline)", () => {
    // With the input pinned far above baseline, the refine factor clamps to 0,
    // so the output sees no production pressure (only its own consumes, here none).
    const p = planet("Starved", { ore: 300, minerals: 200 });
    const before = p.market.minerals;
    p.market.ore = 300;
    applyProductionPulse(p, refinery, baseline, opts);
    expect(p.market.minerals).toBe(before); // production zeroed → no change
  });

  test("refines is inert when the profile omits it (back-compat)", () => {
    const p = planet("Plain", { minerals: 200, ore: 50 });
    const plain = { produces: { minerals: 1 }, consumes: { ore: 1 } };
    applyProductionPulse(p, plain, baseline, opts);
    // Without a refines edge, cheap ore does NOT amplify minerals: a unit
    // producer drops it by exactly rate * baseline (200 * 0.02 = 4).
    expect(p.market.minerals).toBe(196);
  });
});

describe("PLANET_PROFILES table", () => {
  test("covers every seeded planet name once with at least one pressure", () => {
    const expectedNames = [
      "Sol",
      "Valkyrie Depot",
      "New Polaris",
      "Sigma Draconis",
      "Aurelia Mining Hub",
      "Kaelis Colony",
      "Tenebris Prime",
      "Rogue's Hollow",
    ];
    for (const name of expectedNames) {
      const profile = PLANET_PROFILES[name];
      expect(profile).toBeDefined();
      const totalEntries =
        Object.keys(profile.produces || {}).length +
        Object.keys(profile.consumes || {}).length;
      expect(totalEntries).toBeGreaterThan(0);
    }
  });
});

describe("GalaxyHeartbeat integration with ProductionModel", () => {
  test("producer planet's commodity trends down over several pulses", () => {
    const p = { name: "Farm", market: { food: 100 } };
    const hb = new GalaxyHeartbeat({
      planets: [p],
      baseMarkets: { Farm: { food: 100 } },
      lanes: { Farm: [] },
      diffusionRate: 0,
      equilibriumRate: 0, // isolate production
      profiles: { Farm: { produces: { food: 1 } } },
    });

    for (let i = 0; i < 10; i++) hb.pulse();

    expect(p.market.food).toBeLessThan(100);
  });

  test("consumer planet's commodity trends up over several pulses", () => {
    const p = { name: "Forge", market: { minerals: 100 } };
    const hb = new GalaxyHeartbeat({
      planets: [p],
      baseMarkets: { Forge: { minerals: 100 } },
      lanes: { Forge: [] },
      diffusionRate: 0,
      equilibriumRate: 0,
      profiles: { Forge: { consumes: { minerals: 1 } } },
    });

    for (let i = 0; i < 10; i++) hb.pulse();

    expect(p.market.minerals).toBeGreaterThan(100);
  });

  test("production effects are bounded — even after many pulses, price stays in band", () => {
    const farm = { name: "Farm", market: { food: 100 } };
    const forge = { name: "Forge", market: { minerals: 100 } };
    const hb = new GalaxyHeartbeat({
      planets: [farm, forge],
      baseMarkets: { Farm: { food: 100 }, Forge: { minerals: 100 } },
      lanes: { Farm: [], Forge: [] },
      diffusionRate: 0,
      equilibriumRate: 0,
      profiles: {
        Farm: { produces: { food: 1 } },
        Forge: { consumes: { minerals: 1 } },
      },
      productionOptions: {
        productionRate: 0.02,
        consumptionRate: 0.02,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
    });

    for (let i = 0; i < 2000; i++) hb.pulse();

    expect(farm.market.food).toBeGreaterThanOrEqual(40);
    expect(farm.market.food).toBeLessThanOrEqual(250);
    expect(forge.market.minerals).toBeGreaterThanOrEqual(40);
    expect(forge.market.minerals).toBeLessThanOrEqual(250);
  });

  test("a planet without a profile is unaffected by the production step", () => {
    const a = { name: "Farm", market: { food: 100 } };
    const b = { name: "Quiet", market: { food: 100 } };
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      baseMarkets: { Farm: { food: 100 }, Quiet: { food: 100 } },
      lanes: { Farm: [], Quiet: [] },
      diffusionRate: 0,
      equilibriumRate: 0,
      profiles: { Farm: { produces: { food: 1 } } }, // Quiet has none
    });

    for (let i = 0; i < 5; i++) hb.pulse();

    expect(a.market.food).toBeLessThan(100);
    expect(b.market.food).toBe(100);
  });

  test("production pressure on one node propagates to a connected neighbor via diffusion", () => {
    // Farm produces food (price falls); Town has no profile. Lane diffusion
    // should drag Town's food price downward over time toward Farm's.
    const farm = { name: "Farm", market: { food: 100 } };
    const town = { name: "Town", market: { food: 100 } };
    const hb = new GalaxyHeartbeat({
      planets: [farm, town],
      baseMarkets: { Farm: { food: 100 }, Town: { food: 100 } },
      lanes: { Farm: ["Town"], Town: ["Farm"] },
      diffusionRate: 0.2,
      equilibriumRate: 0, // isolate production + diffusion
      profiles: { Farm: { produces: { food: 1 } } },
    });

    for (let i = 0; i < 30; i++) hb.pulse();

    expect(farm.market.food).toBeLessThan(100);
    expect(town.market.food).toBeLessThan(100);
  });

  test("with no profiles configured, pulse behaves exactly like the pre-production heartbeat", () => {
    // Reproduces the existing diffusion-only test; production must be a no-op
    // when no profiles are passed, preserving backwards compatibility.
    const a = { name: "A", market: { food: 300 } };
    const b = { name: "B", market: { food: 100 } };
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: ["B"], B: ["A"] },
      diffusionRate: 0.2,
      equilibriumRate: 0,
    });

    hb.pulse();

    expect(a.market.food).toBeLessThan(300);
    expect(b.market.food).toBeGreaterThan(100);
  });
});

describe("ProductionModel / Caravan Economy Integration", () => {
  test("caravan trading transactions correctly mutate planetary market ore inventory safely within positive bounds", () => {
    const polaris = {
      name: "New Polaris",
      market: { ore: 10 },
      position: new Vector2D(22000, 18800),
    };
    const draconis = {
      name: "Sigma Draconis",
      market: { ore: 50 },
      position: new Vector2D(17800, 21600),
    };

    const ship = {
      position: new Vector2D(22000, 18810),
      velocity: new Vector2D(0, 0),
      controls: { isThrusting: false, isBraking: false },
      clearControls: () => {},
    };

    const ctrl = new AIController(ship, "caravan");
    ctrl.producerPlanetName = "New Polaris";
    ctrl.consumerPlanetName = "Sigma Draconis";
    ctrl.caravanState = "loading";

    // Update with New Polaris (ore: 10) -> Should buy 10 ore (capped by 10)
    ctrl.update(0.1, [polaris, draconis]);
    expect(polaris.market.ore).toBe(0); // Capped at 0 (strictly positive clamp!)
    expect(ctrl.caravanCargo).toEqual({ item: "ore", amount: 10 });
    expect(ctrl.caravanState).toBe("traveling");

    // Move to Draconis, set state to unloading
    ctrl.caravanState = "unloading";
    ship.position = draconis.position.add(new Vector2D(0, 10));
    ctrl.update(0.1, [polaris, draconis]);
    expect(draconis.market.ore).toBe(60); // 50 + 10 = 60
    expect(ctrl.caravanCargo).toBeNull();
    expect(ctrl.caravanState).toBe("traveling");
  });
});
