import { NEBULAE } from "./Nebulae.js";

describe("NEBULAE configuration", () => {
  test("defines three nebula zones", () => {
    expect(Array.isArray(NEBULAE)).toBe(true);
    expect(NEBULAE.length).toBe(3);
  });

  test("every zone has the fields the simulation relies on", () => {
    for (const n of NEBULAE) {
      expect(typeof n.id).toBe("string");
      expect(typeof n.name).toBe("string");
      expect(typeof n.position.x).toBe("number");
      expect(typeof n.position.y).toBe("number");
      expect(n.radius).toBeGreaterThan(0);
      expect(n.dragMultiplier).toBeGreaterThan(1); // nebulae always add drag
      expect(["friction", "shield_dampen", "stealth"]).toContain(n.hazardType);
    }
  });

  test("ids are unique", () => {
    const ids = NEBULAE.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("represents each hazard type exactly once", () => {
    const types = NEBULAE.map((n) => n.hazardType).sort();
    expect(types).toEqual(["friction", "shield_dampen", "stealth"]);
  });
});
