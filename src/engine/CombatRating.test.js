import {
  DEFAULT_COMBAT_RATING_OPTIONS,
  shipBountyValue,
  combatRating,
  combatRank,
  recordKill,
} from "./CombatRating.js";

describe("CombatRating (EW1)", () => {
  test("DEFAULT_COMBAT_RATING_OPTIONS is frozen", () => {
    expect(Object.isFrozen(DEFAULT_COMBAT_RATING_OPTIONS)).toBe(true);
  });

  describe("shipBountyValue", () => {
    test("honors an explicit finite override (rounded, clamped >= 0)", () => {
      expect(shipBountyValue({ bountyValue: 1234 })).toBe(1234);
      expect(shipBountyValue({ bountyValue: 12.6 })).toBe(13);
      expect(shipBountyValue({ bountyValue: -50 })).toBe(0);
    });

    test("derives worth from hull stats when no override is present", () => {
      // base 100 + shield*1 + armor*2 + weapon*25
      expect(
        shipBountyValue({ maxShield: 200, maxArmor: 100, weaponDamage: 15 }),
      ).toBe(100 + 200 + 200 + 375); // 875
    });

    test("is safe on null and on missing/non-finite stats (base only)", () => {
      expect(shipBountyValue(null)).toBe(0);
      expect(shipBountyValue({})).toBe(100);
      expect(
        shipBountyValue({
          maxShield: NaN,
          maxArmor: undefined,
          weaponDamage: "x",
        }),
      ).toBe(100);
    });

    test("respects option overrides", () => {
      expect(
        shipBountyValue(
          { maxArmor: 10 },
          { baseValue: 0, shieldWeight: 0, armorWeight: 5, weaponWeight: 0 },
        ),
      ).toBe(50);
    });
  });

  describe("combatRating", () => {
    test("is 0 for non-positive or non-finite input", () => {
      expect(combatRating(0)).toBe(0);
      expect(combatRating(-100)).toBe(0);
      expect(combatRating(NaN)).toBe(0);
      expect(combatRating(undefined)).toBe(0);
    });

    test("is monotonic non-decreasing in cumulative value", () => {
      const sweep = [0, 100, 500, 1000, 5000, 10000, 50000, 100000, 1e6];
      for (let i = 1; i < sweep.length; i++) {
        expect(combatRating(sweep[i])).toBeGreaterThanOrEqual(
          combatRating(sweep[i - 1]),
        );
      }
    });

    test("is logarithmic: equal absolute gains shrink at higher base", () => {
      const lowGain = combatRating(2000) - combatRating(1000);
      const highGain = combatRating(101000) - combatRating(100000);
      expect(lowGain).toBeGreaterThan(highGain);
    });

    test("matches known reference points with default tuning", () => {
      expect(combatRating(500)).toBe(30); // 100*log10(2)
      expect(combatRating(50000)).toBe(200); // 100*log10(101)
    });
  });

  describe("combatRank", () => {
    test("returns a non-empty label across the curve", () => {
      expect(combatRank(0)).toBe("Harmless");
      expect(combatRank(120)).toBe("Novice");
      expect(combatRank(400)).toBe("Elite");
      expect(combatRank(NaN)).toBe("Harmless");
    });

    test("rank never regresses as rating rises", () => {
      const ratings = [0, 50, 100, 150, 200, 260, 320, 500];
      const order = [
        "Harmless",
        "Mostly Harmless",
        "Novice",
        "Competent",
        "Dangerous",
        "Deadly",
        "Elite",
      ];
      let lastIdx = -1;
      for (const r of ratings) {
        const idx = order.indexOf(combatRank(r));
        expect(idx).toBeGreaterThanOrEqual(lastIdx);
        lastIdx = idx;
      }
    });
  });

  describe("recordKill", () => {
    test("increments kills, accrues value, recomputes rating", () => {
      const led = { kills: 0, combatValue: 0, combatRating: 0 };
      recordKill(led, 500);
      expect(led.kills).toBe(1);
      expect(led.combatValue).toBe(500);
      expect(led.combatRating).toBe(combatRating(500));
    });

    test("accumulates across multiple kills with non-decreasing rating", () => {
      const led = { kills: 0, combatValue: 0, combatRating: 0 };
      recordKill(led, 800);
      const r1 = led.combatRating;
      recordKill(led, 1200);
      expect(led.kills).toBe(2);
      expect(led.combatValue).toBe(2000);
      expect(led.combatRating).toBeGreaterThanOrEqual(r1);
    });

    test("a zero/negative/NaN value still counts a kill but adds no value", () => {
      const led = { kills: 0, combatValue: 0, combatRating: 0 };
      recordKill(led, NaN);
      recordKill(led, -10);
      expect(led.kills).toBe(2);
      expect(led.combatValue).toBe(0);
      expect(led.combatRating).toBe(0);
    });

    test("initializes missing fields and is null-safe", () => {
      expect(recordKill(null, 100)).toBeNull();
      const bare = {};
      recordKill(bare, 500);
      expect(bare.kills).toBe(1);
      expect(bare.combatValue).toBe(500);
      expect(bare.combatRating).toBe(combatRating(500));
    });
  });
});
