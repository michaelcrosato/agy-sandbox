import { EconomyManager } from "./EconomyManager.js";
import { Planet } from "./Planet.js";
import { BASE_MARKETS } from "./GameInstance.js";

describe("EconomyManager", () => {
  let planets;
  let manager;

  beforeEach(() => {
    // Construct local mock planets with copy of BASE_MARKETS values
    planets = [
      new Planet({
        name: "Sol",
        market: { ...BASE_MARKETS["Sol"] },
      }),
      new Planet({
        name: "Valkyrie Depot",
        market: { ...BASE_MARKETS["Valkyrie Depot"] },
      }),
    ];
    manager = new EconomyManager(planets);
  });

  test("should initialize correctly with empty or passed planets", () => {
    const emptyManager = new EconomyManager();
    expect(emptyManager.planets).toEqual([]);
    expect(emptyManager.activeEconomicEvent).toBeNull();

    expect(manager.planets).toHaveLength(2);
    expect(manager.activeEconomicEvent).toBeNull();
  });

  test("should register buy operations and correctly increase prices capped at limits", () => {
    const baseSolFood = BASE_MARKETS["Sol"]["food"]; // 100
    const sol = planets.find((p) => p.name === "Sol");

    // Buy operations should tick price up
    const price1 = manager.registerBuy("Sol", "food");
    expect(price1).toBeGreaterThan(baseSolFood);
    expect(sol.market.food).toBe(price1);

    // Keep buying until it caps
    for (let i = 0; i < 100; i++) {
      manager.registerBuy("Sol", "food");
    }
    const cappedPrice = sol.market.food;
    expect(cappedPrice).toBe(Math.round(baseSolFood * 2.5)); // maxFactor is 2.5
  });

  test("should register sell operations and decrease prices capped at limits", () => {
    const baseSolElectronics = BASE_MARKETS["Sol"]["electronics"]; // 300
    const sol = planets.find((p) => p.name === "Sol");

    const price1 = manager.registerSell("Sol", "electronics");
    expect(price1).toBeLessThan(baseSolElectronics);
    expect(sol.market.electronics).toBe(price1);

    // Keep selling until it caps
    for (let i = 0; i < 100; i++) {
      manager.registerSell("Sol", "electronics");
    }
    const cappedPrice = sol.market.electronics;
    expect(cappedPrice).toBe(Math.round(baseSolElectronics * 0.4)); // minFactor is 0.4
  });

  test("should gradually normalize prices back to baseline", () => {
    const sol = planets.find((p) => p.name === "Sol");
    const originalFoodPrice = sol.market.food; // 100

    // Force price away from baseline
    sol.market.food = 200;

    // Normalization should drift it back
    let changed = manager.normalizePrices();
    expect(changed).toContain(sol);
    expect(sol.market.food).toBeLessThan(200);
    expect(sol.market.food).toBeGreaterThan(originalFoodPrice);

    // Drifting repeatedly should arrive back at baseline
    for (let i = 0; i < 200; i++) {
      manager.normalizePrices();
    }
    expect(sol.market.food).toBe(originalFoodPrice);
  });

  test("should trigger dynamic random shortage and surplus events", () => {
    const event = manager.triggerRandomEvent();
    expect(event).toBeDefined();
    expect(event.planetName).toBeDefined();
    expect(event.commodity).toBeDefined();
    expect(event.originalPrice).toBeDefined();
    expect(event.newPrice).toBeDefined();
    expect(event.type).toBe(event.isShortage ? "shortage" : "surplus");

    const targetPlanet = planets.find((p) => p.name === event.planetName);
    expect(targetPlanet.market[event.commodity]).toBe(event.newPrice);
    expect(manager.activeEconomicEvent).toEqual(event);
  });

  test("should prevent normalizing prices for items currently undergoing active event", () => {
    // Force shortage event on Sol food
    const sol = planets.find((p) => p.name === "Sol");
    const basePrice = BASE_MARKETS["Sol"]["food"];
    sol.market.food = basePrice; // base

    manager.activeEconomicEvent = {
      planetName: "Sol",
      commodity: "food",
      originalPrice: basePrice,
      newPrice: basePrice * 1.8,
      isShortage: true,
      type: "shortage",
    };
    sol.market.food = basePrice * 1.8;

    // Normalizing prices should NOT change Sol food
    manager.normalizePrices();
    expect(sol.market.food).toBe(basePrice * 1.8);

    // Clear event and normalize, price should drift back
    manager.clearActiveEvent();
    expect(sol.market.food).toBe(basePrice); // clear restores baseline directly
  });

  test("should tick event durations and end expired events correctly", () => {
    manager.triggerRandomEvent("shortage");
    expect(manager.activeEconomicEvent).toBeDefined();
    expect(manager.eventDurationTimer).toBe(45);

    // Tick by 30 seconds
    const status1 = manager.updateEvents(30);
    expect(status1).toBeNull();
    expect(manager.eventDurationTimer).toBe(15);

    // Tick remaining 15 seconds
    const status2 = manager.updateEvents(15);
    expect(status2).toBeDefined();
    expect(status2.type).toBe("event_ended");
    expect(manager.activeEconomicEvent).toBeNull();
  });

  test("should not poison prices with NaN when a commodity has no baseline", () => {
    const sol = planets.find((p) => p.name === "Sol");
    // A market key that BASE_MARKETS["Sol"] does not define — the kind of
    // mismatch a cross-version persistence restore can introduce.
    expect(BASE_MARKETS["Sol"].exotic_matter).toBeUndefined();
    sol.market.exotic_matter = 500;

    manager.normalizePrices();

    // The unbaselined price is left exactly as-is, never drifted to NaN.
    expect(sol.market.exotic_matter).toBe(500);
    expect(Number.isFinite(sol.market.exotic_matter)).toBe(true);

    // A normal, baselined commodity on the same planet still drifts as before.
    sol.market.food = 200;
    manager.normalizePrices();
    expect(sol.market.food).toBeLessThan(200);
    expect(Number.isFinite(sol.market.food)).toBe(true);
  });

  test("self-heals a non-finite price back to its baseline (spec 006)", () => {
    const sol = planets.find((p) => p.name === "Sol");
    const baseFood = BASE_MARKETS["Sol"].food;
    sol.market.food = NaN;

    manager.normalizePrices();

    expect(sol.market.food).toBe(baseFood);
    expect(Number.isFinite(sol.market.food)).toBe(true);
  });
});
