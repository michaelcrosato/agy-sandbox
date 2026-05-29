import { DEFAULT_MINING_OPTIONS, mineYield } from "./Mining.js";
import { createSeededRng } from "./GenerativeMissions.js";

describe("Mining (EW9)", () => {
  test("DEFAULT_MINING_OPTIONS is frozen", () => {
    expect(Object.isFrozen(DEFAULT_MINING_OPTIONS)).toBe(true);
  });

  test("is deterministic for a given seed", () => {
    expect(mineYield("gem_asteroid", createSeededRng(9))).toEqual(
      mineYield("gem_asteroid", createSeededRng(9)),
    );
    expect(mineYield("generic", createSeededRng(3))).toEqual(
      mineYield("generic", createSeededRng(3)),
    );
  });

  test("gem asteroids yield 2-3 luxuries", () => {
    for (const seed of [1, 2, 3, 50, 999]) {
      const y = mineYield("gem_asteroid", createSeededRng(seed));
      expect(y.resource).toBe("luxuries");
      expect(y.count).toBeGreaterThanOrEqual(2);
      expect(y.count).toBeLessThanOrEqual(3);
    }
  });

  test("generic asteroids yield 1-2 minerals", () => {
    for (const seed of [1, 2, 3, 50, 999]) {
      const y = mineYield("generic", createSeededRng(seed));
      expect(y.resource).toBe("minerals");
      expect(y.count).toBeGreaterThanOrEqual(1);
      expect(y.count).toBeLessThanOrEqual(2);
    }
  });

  test("fixed rng endpoints map to the base min/max", () => {
    expect(mineYield("gem_asteroid", () => 0).count).toBe(2);
    expect(mineYield("gem_asteroid", () => 0.999).count).toBe(3);
    expect(mineYield("generic", () => 0).count).toBe(1);
    expect(mineYield("generic", () => 0.999).count).toBe(2);
  });

  test("a Mining Laser multiplier increases the count", () => {
    const base = mineYield("generic", () => 0.999).count; // 2
    const boosted = mineYield("generic", () => 0.999, {
      yieldMultiplier: 2,
    }).count;
    expect(boosted).toBe(Math.round(base * 2)); // 4
    expect(boosted).toBeGreaterThan(base);
  });

  test("non-positive / non-finite multiplier is treated as 1, count >= 1", () => {
    expect(mineYield("generic", () => 0, { yieldMultiplier: 0 }).count).toBe(1);
    expect(mineYield("generic", () => 0, { yieldMultiplier: NaN }).count).toBe(
      1,
    );
  });
});
