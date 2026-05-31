import {
  COMMODITIES,
  COMMODITIES_METADATA,
  BASE_MARKETS,
  SCHEMAS,
} from "./SchemaRegistry.js";

describe("SchemaRegistry Invariants and Parity Tests", () => {
  test("COMMODITIES array perfectly reflects the 7 canonical tradeables in wire-order", () => {
    expect(COMMODITIES).toEqual([
      "food",
      "electronics",
      "minerals",
      "luxuries",
      "contraband",
      "machinery",
      "ore",
    ]);
    expect(Object.isFrozen(COMMODITIES)).toBe(true);
  });

  test("COMMODITIES_METADATA contains correct structure, types, and properties for all commodities", () => {
    expect(Object.keys(COMMODITIES_METADATA)).toEqual(COMMODITIES);
    expect(Object.isFrozen(COMMODITIES_METADATA)).toBe(true);

    for (const commodity of COMMODITIES) {
      const meta = COMMODITIES_METADATA[commodity];
      expect(meta).toBeDefined();

      // mass assertions (must be positive number)
      expect(typeof meta.mass).toBe("number");
      expect(meta.mass).toBeGreaterThan(0);

      // baseValue assertions (must be positive integer/number)
      expect(typeof meta.baseValue).toBe("number");
      expect(meta.baseValue).toBeGreaterThan(0);

      // illegal assertions (must be boolean)
      expect(typeof meta.illegal).toBe("boolean");

      // category assertions (must be non-empty string)
      expect(typeof meta.category).toBe("string");
      expect(meta.category.length).toBeGreaterThan(0);

      // contraband must be the only illegal item
      if (commodity === "contraband") {
        expect(meta.illegal).toBe(true);
      } else {
        expect(meta.illegal).toBe(false);
      }
    }
  });

  test("every planet defined in BASE_MARKETS has keys exactly covering COMMODITIES", () => {
    expect(Object.isFrozen(BASE_MARKETS)).toBe(true);
    const planets = Object.keys(BASE_MARKETS);

    // Check that we have all 8 base planets
    expect(planets.length).toBe(8);
    expect(planets).toContain("Sol");
    expect(planets).toContain("New Polaris");
    expect(planets).toContain("Sigma Draconis");
    expect(planets).toContain("Kaelis Colony");
    expect(planets).toContain("Aurelia Mining Hub");
    expect(planets).toContain("Tenebris Prime");
    expect(planets).toContain("Valkyrie Depot");
    expect(planets).toContain("Rogue's Hollow");

    for (const planet of planets) {
      const market = BASE_MARKETS[planet];
      expect(market).toBeDefined();

      const marketKeys = Object.keys(market);
      // Perfect set parity with COMMODITIES
      expect(marketKeys.sort()).toEqual([...COMMODITIES].sort());

      for (const commodity of COMMODITIES) {
        const price = market[commodity];
        expect(typeof price).toBe("number");
        expect(price).toBeGreaterThan(0);
      }
    }
  });

  test("SCHEMAS definitions are frozen and contain valid rule structures", () => {
    expect(Object.isFrozen(SCHEMAS)).toBe(true);
    expect(SCHEMAS.join).toBeDefined();
    expect(SCHEMAS.trade).toBeDefined();
    expect(SCHEMAS.controls).toBeDefined();

    // Verify a representative schema structure (e.g. trade)
    const tradeSchema = SCHEMAS.trade;
    expect(tradeSchema.planetName).toEqual({ type: "string", required: true });
    expect(tradeSchema.commodity).toEqual({ type: "string", required: true });
    expect(tradeSchema.amount).toEqual({
      type: "integer",
      required: true,
      min: 0,
    });
    expect(tradeSchema.buy).toEqual({ type: "boolean", required: true });
  });
});
