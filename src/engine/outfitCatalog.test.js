import { DEFAULT_OUTFITS } from "./outfitCatalog.js";
import { applyOutfitStats } from "./Outfitting.js";
import { Ship } from "./Ship.js";
import { Planet } from "./Planet.js";

describe("outfitCatalog (spec 020)", () => {
  test("DEFAULT_OUTFITS is frozen and non-empty", () => {
    expect(Object.isFrozen(DEFAULT_OUTFITS)).toBe(true);
    expect(DEFAULT_OUTFITS.length).toBeGreaterThan(0);
  });

  test("every entry has a name/type/value and positive mass", () => {
    for (const o of DEFAULT_OUTFITS) {
      expect(typeof o.name).toBe("string");
      expect(typeof o.type).toBe("string");
      expect(typeof o.value).toBe("number");
      expect(o.mass).toBeGreaterThan(0);
    }
  });

  test("Planet's default outfitter is the single shared catalogue", () => {
    const p = new Planet({ name: "Sol" });
    expect(p.outfitter).toBe(DEFAULT_OUTFITS);
  });

  test("the EW outfits the old salvage catalog ignored now apply stats", () => {
    // The dedup's real fix: the old inline salvage catalogue was a stale subset
    // missing pierce/ramscoop/fuel/miner, so salvaging those applied no stats.
    for (const name of [
      "Ion Disruptor Array",
      "Ramscoop Collector",
      "Auxiliary Fuel Cells",
      "Mining Laser",
    ]) {
      const o = DEFAULT_OUTFITS.find((x) => x.name === name);
      expect(o).toBeDefined();
      expect(applyOutfitStats(new Ship(), o)).toBe(true);
    }
  });

  test("every stat-bearing catalogue outfit applies cleanly", () => {
    // `tractor` is intentionally stat-less (the tractor beam works by outfit
    // presence, not a stat bonus), so it is excluded from this assertion.
    for (const o of DEFAULT_OUTFITS.filter((x) => x.type !== "tractor")) {
      expect(applyOutfitStats(new Ship(), o)).toBe(true);
    }
  });
});
