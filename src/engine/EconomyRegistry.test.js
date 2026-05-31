import { CommoditiesRegistry } from "./EconomyManager.js";
import { GalaxyHeartbeat } from "./GalaxyHeartbeat.js";
import { SandboxSecurityRegistry } from "../net/SandboxSecurityRegistry.js";

describe("CommoditiesRegistry", () => {
  test("should define SCHEMAS for all standard commodities", () => {
    expect(CommoditiesRegistry.SCHEMAS.food).toEqual({
      mass: 1.0,
      baseValue: 100,
      category: "basic",
    });
    expect(CommoditiesRegistry.SCHEMAS.electronics).toEqual({
      mass: 2.0,
      baseValue: 300,
      category: "tech",
    });
    expect(CommoditiesRegistry.SCHEMAS.minerals).toEqual({
      mass: 1.5,
      baseValue: 150,
      category: "raw",
    });
    expect(CommoditiesRegistry.SCHEMAS.luxuries).toEqual({
      mass: 1.0,
      baseValue: 600,
      category: "luxury",
    });
    expect(CommoditiesRegistry.SCHEMAS.contraband).toEqual({
      mass: 0.5,
      baseValue: 250,
      category: "contraband",
    });
    expect(CommoditiesRegistry.SCHEMAS.machinery).toEqual({
      mass: 3.0,
      baseValue: 100,
      category: "industrial",
    });
    expect(CommoditiesRegistry.SCHEMAS.ore).toEqual({
      mass: 2.5,
      baseValue: 90,
      category: "raw",
    });
    expect(CommoditiesRegistry.SCHEMAS.fuel).toEqual({
      mass: 0.8,
      baseValue: 50,
      category: "fuel",
    });
    expect(CommoditiesRegistry.SCHEMAS.alloys).toEqual({
      mass: 2.0,
      baseValue: 200,
      category: "industrial",
    });
    expect(CommoditiesRegistry.SCHEMAS.tech).toEqual({
      mass: 1.2,
      baseValue: 400,
      category: "tech",
    });
  });

  test("should successfully validate correct properties", () => {
    const res = CommoditiesRegistry.validate("food", {
      mass: 1.0,
      baseValue: 100,
      category: "basic",
    });
    expect(res.valid).toBe(true);
  });

  test("should reject undefined commodities", () => {
    const res = CommoditiesRegistry.validate("unobtainium", {
      mass: 1.0,
      baseValue: 100,
      category: "basic",
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("not defined in registry schema");
  });

  test("should reject invalid mass", () => {
    const res1 = CommoditiesRegistry.validate("food", {
      mass: -5,
      baseValue: 100,
      category: "basic",
    });
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("Invalid mass");

    const res2 = CommoditiesRegistry.validate("food", {
      mass: "heavy",
      baseValue: 100,
      category: "basic",
    });
    expect(res2.valid).toBe(false);
  });

  test("should reject invalid baseValue", () => {
    const res1 = CommoditiesRegistry.validate("food", {
      mass: 1.0,
      baseValue: -10,
      category: "basic",
    });
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("Invalid baseValue");

    const res2 = CommoditiesRegistry.validate("food", {
      mass: 1.0,
      baseValue: NaN,
      category: "basic",
    });
    expect(res2.valid).toBe(false);
  });

  test("should reject invalid category", () => {
    const res1 = CommoditiesRegistry.validate("food", {
      mass: 1.0,
      baseValue: 100,
      category: "",
    });
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("Invalid category");

    const res2 = CommoditiesRegistry.validate("food", {
      mass: 1.0,
      baseValue: 100,
      category: 123,
    });
    expect(res2.valid).toBe(false);
  });
});

describe("GalaxyHeartbeat Economic Invariant Sentry", () => {
  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  test("should clamp and heal planet prices outside [5, 5000]", () => {
    const planets = [
      {
        name: "Sol",
        market: { food: 2, electronics: 6000, minerals: NaN, alloys: 200 },
      },
    ];
    const hb = new GalaxyHeartbeat({
      planets,
      baseMarkets: {
        Sol: { food: 100, electronics: 300, minerals: 150, alloys: 200 },
      },
      lanes: {},
      diffusionRate: 0,
      equilibriumRate: 0,
    });

    const changed = hb.pulse();

    // Prices should be healed to their baseline
    expect(planets[0].market.food).toBe(100);
    expect(planets[0].market.electronics).toBe(300);
    expect(planets[0].market.minerals).toBe(150);
    expect(planets[0].market.alloys).toBe(200); // healthy price unchanged

    // Telemetry and registry logs check
    expect(hb.economyDriftsTotal).toBe(3); // food, electronics, minerals
    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_by_category.economy).toBe(3);
  });

  test("should correct negative and non-finite ship cargo counts", () => {
    const entities = [
      {
        id: "ship-1",
        type: "ship",
        name: "Alpha",
        cargo: { food: -5, electronics: NaN, alloys: 10 },
      },
      { id: "ship-2", type: "ship", name: "Beta", cargo: { food: 5 } },
    ];
    const hb = new GalaxyHeartbeat({
      planets: [],
      lanes: {},
    });

    hb.pulse(entities);

    expect(entities[0].cargo.food).toBe(0);
    expect(entities[0].cargo.electronics).toBe(0);
    expect(entities[0].cargo.alloys).toBe(10); // unchanged
    expect(entities[1].cargo.food).toBe(5); // unchanged

    expect(hb.economyDriftsTotal).toBe(2);
    const metrics = SandboxSecurityRegistry.getMetrics();
    expect(metrics.security_violations_by_category.economy).toBe(2);
  });

  test("should audit and restrict production rates", () => {
    const hb = new GalaxyHeartbeat({
      planets: [],
      productionOptions: {
        productionRate: 0.15, // too high!
        consumptionRate: 0.02,
      },
    });

    hb.pulse();

    expect(hb.productionOptions.productionRate).toBe(0.02); // healed to default
    expect(hb.economyDriftsTotal).toBe(1);
  });

  test("should audit and clamp profile strengths", () => {
    const hb = new GalaxyHeartbeat({
      planets: [],
      profiles: {
        Sol: {
          produces: { machinery: 3.5 }, // too strong!
          consumes: { food: -0.5 }, // invalid!
        },
      },
    });

    hb.pulse();

    expect(hb.profiles.Sol.produces.machinery).toBe(2.0); // clamped
    expect(hb.profiles.Sol.consumes.food).toBe(1.0); // healed default
    expect(hb.economyDriftsTotal).toBe(2);
  });
});
