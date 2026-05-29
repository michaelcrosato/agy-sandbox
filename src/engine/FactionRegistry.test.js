import {
  FactionRegistry,
  DEFAULT_FACTIONS,
  DEFAULT_RELATIONS,
  DEFAULT_OPTIONS,
  classifyStanding,
  dockingPermitted,
  priceModifier,
} from "./FactionRegistry.js";

describe("classifyStanding", () => {
  test("standings above the friendly threshold classify as friendly", () => {
    expect(classifyStanding(50)).toBe("friendly");
    expect(classifyStanding(30)).toBe("friendly"); // inclusive
  });

  test("standings below the hostile threshold classify as hostile", () => {
    expect(classifyStanding(-50)).toBe("hostile");
    expect(classifyStanding(-30)).toBe("hostile"); // inclusive
  });

  test("standings strictly between thresholds classify as neutral", () => {
    expect(classifyStanding(0)).toBe("neutral");
    expect(classifyStanding(29)).toBe("neutral");
    expect(classifyStanding(-29)).toBe("neutral");
  });

  test("honors custom thresholds passed in options", () => {
    const opts = { ...DEFAULT_OPTIONS, hostileThreshold: -10, friendlyThreshold: 10 };
    expect(classifyStanding(15, opts)).toBe("friendly");
    expect(classifyStanding(-15, opts)).toBe("hostile");
    expect(classifyStanding(0, opts)).toBe("neutral");
  });
});

describe("FactionRegistry construction & defaults", () => {
  test("constructs with the default roster and relations", () => {
    const reg = new FactionRegistry();
    for (const faction of DEFAULT_FACTIONS) {
      expect(reg.hasFaction(faction)).toBe(true);
    }
    expect(reg.factions.length).toBe(DEFAULT_FACTIONS.length);
  });

  test("default relations are symmetric for every ally/enemy pair", () => {
    for (const a of DEFAULT_FACTIONS) {
      for (const b of DEFAULT_FACTIONS) {
        if (a === b) continue;
        const ab = DEFAULT_RELATIONS[a][b];
        const ba = DEFAULT_RELATIONS[b][a];
        expect(ab).toBe(ba);
      }
    }
  });

  test("unknown faction reads as 0 without recording anything", () => {
    const reg = new FactionRegistry();
    expect(reg.getStanding("p1", "Ghosts")).toBe(0);
    expect(reg.serialize().standings).toEqual({});
  });

  test("unknown player reads as 0 across all factions", () => {
    const reg = new FactionRegistry();
    expect(reg.getStanding("nobody", "Federation")).toBe(0);
    expect(reg.getAllStandings("nobody")).toEqual({});
  });
});

describe("FactionRegistry.getRelation", () => {
  test("returns 'neutral' for a faction's relation with itself", () => {
    const reg = new FactionRegistry();
    expect(reg.getRelation("Federation", "Federation")).toBe("neutral");
  });

  test("returns the relation defined in the table", () => {
    const reg = new FactionRegistry();
    expect(reg.getRelation("Federation", "Pirates")).toBe("enemy");
    expect(reg.getRelation("Federation", "Independents")).toBe("ally");
    expect(reg.getRelation("Federation", "Frontier League")).toBe("neutral");
  });

  test("falls back to 'neutral' when no relation is registered", () => {
    const reg = new FactionRegistry({
      factions: ["A", "B"],
      relations: {}, // empty table
    });
    expect(reg.getRelation("A", "B")).toBe("neutral");
  });
});

describe("FactionRegistry.setStanding clamping", () => {
  test("clamps values above the configured ceiling", () => {
    const reg = new FactionRegistry();
    const stored = reg.setStanding("p1", "Federation", 9999);
    expect(stored).toBe(DEFAULT_OPTIONS.maxStanding);
    expect(reg.getStanding("p1", "Federation")).toBe(DEFAULT_OPTIONS.maxStanding);
  });

  test("clamps values below the configured floor", () => {
    const reg = new FactionRegistry();
    const stored = reg.setStanding("p1", "Federation", -9999);
    expect(stored).toBe(DEFAULT_OPTIONS.minStanding);
    expect(reg.getStanding("p1", "Federation")).toBe(DEFAULT_OPTIONS.minStanding);
  });

  test("honors custom min/max from options", () => {
    const reg = new FactionRegistry({ options: { minStanding: -5, maxStanding: 5 } });
    reg.setStanding("p1", "Federation", 100);
    expect(reg.getStanding("p1", "Federation")).toBe(5);
    reg.setStanding("p1", "Federation", -100);
    expect(reg.getStanding("p1", "Federation")).toBe(-5);
  });

  test("rejects writes to unknown factions and returns 0", () => {
    const reg = new FactionRegistry();
    expect(reg.setStanding("p1", "Ghosts", 25)).toBe(0);
    expect(reg.getStanding("p1", "Ghosts")).toBe(0);
  });
});

describe("FactionRegistry.adjustStanding — primary effect and clamping", () => {
  test("a positive delta increases the primary standing", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", 10);
    expect(reg.getStanding("p1", "Federation")).toBe(10);
  });

  test("a negative delta decreases the primary standing", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", -15);
    expect(reg.getStanding("p1", "Federation")).toBe(-15);
  });

  test("the primary write is clamped at the ceiling", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 95);
    reg.adjustStanding("p1", "Federation", 50);
    expect(reg.getStanding("p1", "Federation")).toBe(DEFAULT_OPTIONS.maxStanding);
  });

  test("the primary write is clamped at the floor", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", -95);
    reg.adjustStanding("p1", "Federation", -50);
    expect(reg.getStanding("p1", "Federation")).toBe(DEFAULT_OPTIONS.minStanding);
  });

  test("a zero delta is a no-op and does not propagate", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Pirates", 20);
    reg.adjustStanding("p1", "Federation", 0);
    expect(reg.getStanding("p1", "Federation")).toBe(0);
    expect(reg.getStanding("p1", "Pirates")).toBe(20);
  });

  test("returns a map of every faction that was written", () => {
    const reg = new FactionRegistry();
    const changes = reg.adjustStanding("p1", "Federation", 10);
    // Primary plus one ally (Independents) plus one enemy (Pirates).
    expect(changes.Federation).toBe(10);
    expect(changes.Independents).toBeCloseTo(5, 10);
    expect(changes.Pirates).toBeCloseTo(-5, 10);
    expect(changes["Frontier League"]).toBeUndefined(); // neutral relation
  });

  test("does nothing and returns empty map when the faction is unknown", () => {
    const reg = new FactionRegistry();
    expect(reg.adjustStanding("p1", "Ghosts", 10)).toEqual({});
    expect(reg.serialize().standings).toEqual({});
  });
});

describe("FactionRegistry.adjustStanding — ally/enemy propagation signs", () => {
  test("helping a faction raises its allies and lowers its enemies", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", 20);
    expect(reg.getStanding("p1", "Federation")).toBe(20);
    expect(reg.getStanding("p1", "Independents")).toBeCloseTo(
      20 * DEFAULT_OPTIONS.allyPropagation,
      10,
    ); // ally gains
    expect(reg.getStanding("p1", "Pirates")).toBeCloseTo(
      -20 * DEFAULT_OPTIONS.enemyPropagation,
      10,
    ); // enemy loses
    expect(reg.getStanding("p1", "Frontier League")).toBe(0); // neutral
  });

  test("harming a faction lowers its allies and raises its enemies", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", -20);
    expect(reg.getStanding("p1", "Federation")).toBe(-20);
    expect(reg.getStanding("p1", "Independents")).toBeCloseTo(
      -20 * DEFAULT_OPTIONS.allyPropagation,
      10,
    ); // ally loses too
    expect(reg.getStanding("p1", "Pirates")).toBeCloseTo(
      20 * DEFAULT_OPTIONS.enemyPropagation,
      10,
    ); // enemy is happy
  });

  test("propagation uses the requested delta even when the primary clamps", () => {
    // Already at the ceiling: primary cannot move further, but the action's
    // diplomatic fallout (gift to allies, anger to enemies) still applies.
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", DEFAULT_OPTIONS.maxStanding);
    reg.setStanding("p1", "Pirates", 0);
    reg.setStanding("p1", "Independents", 0);
    reg.adjustStanding("p1", "Federation", 40);
    expect(reg.getStanding("p1", "Federation")).toBe(DEFAULT_OPTIONS.maxStanding);
    expect(reg.getStanding("p1", "Independents")).toBeCloseTo(20, 10);
    expect(reg.getStanding("p1", "Pirates")).toBeCloseTo(-20, 10);
  });

  test("propagation fractions can be tuned via options", () => {
    const reg = new FactionRegistry({
      options: { allyPropagation: 0.25, enemyPropagation: 0.75 },
    });
    reg.adjustStanding("p1", "Federation", 40);
    expect(reg.getStanding("p1", "Independents")).toBeCloseTo(10, 10);
    expect(reg.getStanding("p1", "Pirates")).toBeCloseTo(-30, 10);
  });

  test("isolates per-player state — adjusting p1 does not move p2", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", 50);
    expect(reg.getStanding("p2", "Federation")).toBe(0);
    expect(reg.getStanding("p2", "Independents")).toBe(0);
    expect(reg.getStanding("p2", "Pirates")).toBe(0);
  });

  test("never propagates to itself even if the relations table is malformed", () => {
    const reg = new FactionRegistry({
      factions: ["A", "B"],
      relations: { A: { A: "ally", B: "ally" }, B: { A: "ally", B: "ally" } },
    });
    reg.adjustStanding("p1", "A", 10);
    // Self-row is ignored; only B receives propagation.
    expect(reg.getStanding("p1", "A")).toBe(10);
    expect(reg.getStanding("p1", "B")).toBeCloseTo(5, 10);
  });
});

describe("FactionRegistry.classify thresholds", () => {
  test("classifies as friendly at or above the friendly threshold", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 30);
    expect(reg.classify("p1", "Federation")).toBe("friendly");
    reg.setStanding("p1", "Federation", 75);
    expect(reg.classify("p1", "Federation")).toBe("friendly");
  });

  test("classifies as hostile at or below the hostile threshold", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", -30);
    expect(reg.classify("p1", "Federation")).toBe("hostile");
    reg.setStanding("p1", "Federation", -90);
    expect(reg.classify("p1", "Federation")).toBe("hostile");
  });

  test("classifies between thresholds as neutral", () => {
    const reg = new FactionRegistry();
    expect(reg.classify("p1", "Federation")).toBe("neutral"); // unknown -> 0
    reg.setStanding("p1", "Federation", 29);
    expect(reg.classify("p1", "Federation")).toBe("neutral");
    reg.setStanding("p1", "Federation", -29);
    expect(reg.classify("p1", "Federation")).toBe("neutral");
  });

  test("respects per-registry threshold overrides", () => {
    const reg = new FactionRegistry({
      options: { hostileThreshold: -10, friendlyThreshold: 10 },
    });
    reg.setStanding("p1", "Federation", 11);
    expect(reg.classify("p1", "Federation")).toBe("friendly");
    reg.setStanding("p1", "Federation", -11);
    expect(reg.classify("p1", "Federation")).toBe("hostile");
  });
});

describe("FactionRegistry.decay direction", () => {
  test("positive standings shrink toward zero", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 50);
    reg.decay("p1", 0.1);
    const after = reg.getStanding("p1", "Federation");
    expect(after).toBeLessThan(50);
    expect(after).toBeGreaterThan(0);
  });

  test("negative standings grow toward zero", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", -50);
    reg.decay("p1", 0.1);
    const after = reg.getStanding("p1", "Federation");
    expect(after).toBeGreaterThan(-50);
    expect(after).toBeLessThan(0);
  });

  test("a zero standing stays at zero", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 0);
    const changes = reg.decay("p1", 0.5);
    expect(reg.getStanding("p1", "Federation")).toBe(0);
    expect(changes).toEqual({}); // unchanged values are not reported
  });

  test("running decay many times drives every standing toward zero without crossing it", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 80);
    reg.setStanding("p1", "Pirates", -80);
    for (let i = 0; i < 500; i++) reg.decay("p1", 0.05);
    const fed = reg.getStanding("p1", "Federation");
    const pir = reg.getStanding("p1", "Pirates");
    expect(fed).toBeGreaterThanOrEqual(0);
    expect(fed).toBeLessThan(1);
    expect(pir).toBeLessThanOrEqual(0);
    expect(pir).toBeGreaterThan(-1);
  });

  test("decay on unknown player is a no-op and returns empty map", () => {
    const reg = new FactionRegistry();
    expect(reg.decay("nobody")).toEqual({});
  });

  test("decayAll touches every tracked player", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 40);
    reg.setStanding("p2", "Pirates", -40);
    const all = reg.decayAll(0.1);
    expect(all.p1.Federation).toBeCloseTo(36, 10);
    expect(all.p2.Pirates).toBeCloseTo(-36, 10);
  });
});

describe("dockingPermitted", () => {
  test("hostile standings are refused docking", () => {
    expect(dockingPermitted(-100)).toBe(false);
    expect(dockingPermitted(-30)).toBe(false); // inclusive hostile threshold
  });

  test("neutral and friendly standings are permitted", () => {
    expect(dockingPermitted(0)).toBe(true);
    expect(dockingPermitted(-29)).toBe(true);
    expect(dockingPermitted(30)).toBe(true);
    expect(dockingPermitted(100)).toBe(true);
  });

  test("respects custom threshold overrides", () => {
    const opts = { ...DEFAULT_OPTIONS, hostileThreshold: -10 };
    expect(dockingPermitted(-15, opts)).toBe(false);
    expect(dockingPermitted(-9, opts)).toBe(true);
  });
});

describe("priceModifier", () => {
  test("returns 1.0 at zero standing in either mode", () => {
    expect(priceModifier(0)).toBe(1);
    expect(priceModifier(0, DEFAULT_OPTIONS, "sell")).toBe(1);
  });

  test("buy multiplier decreases as standing rises (friendlier = cheaper)", () => {
    const high = priceModifier(50);
    const max = priceModifier(DEFAULT_OPTIONS.maxStanding);
    expect(high).toBeLessThan(1);
    expect(max).toBeLessThan(high);
    expect(max).toBeCloseTo(1 - DEFAULT_OPTIONS.maxPriceSwing, 10);
  });

  test("buy multiplier increases as standing falls (hostile = price gouge)", () => {
    const low = priceModifier(-50);
    const min = priceModifier(DEFAULT_OPTIONS.minStanding);
    expect(low).toBeGreaterThan(1);
    expect(min).toBeGreaterThan(low);
    expect(min).toBeCloseTo(1 + DEFAULT_OPTIONS.maxPriceSwing, 10);
  });

  test("sell multiplier inverts the buy direction (friendly = higher payouts)", () => {
    const friendlyBuy = priceModifier(
      DEFAULT_OPTIONS.maxStanding,
      DEFAULT_OPTIONS,
      "buy",
    );
    const friendlySell = priceModifier(
      DEFAULT_OPTIONS.maxStanding,
      DEFAULT_OPTIONS,
      "sell",
    );
    expect(friendlySell).toBeGreaterThan(1);
    expect(friendlySell).toBeCloseTo(2 - friendlyBuy, 10);
    const hostileSell = priceModifier(
      DEFAULT_OPTIONS.minStanding,
      DEFAULT_OPTIONS,
      "sell",
    );
    expect(hostileSell).toBeCloseTo(1 - DEFAULT_OPTIONS.maxPriceSwing, 10);
  });

  test("clamps standings beyond the configured band so callers cannot weaponize overflow", () => {
    const beyondMax = priceModifier(999_999);
    const atMax = priceModifier(DEFAULT_OPTIONS.maxStanding);
    expect(beyondMax).toBe(atMax);
    const beyondMin = priceModifier(-999_999);
    const atMin = priceModifier(DEFAULT_OPTIONS.minStanding);
    expect(beyondMin).toBe(atMin);
  });

  test("swing magnitude is tunable via maxPriceSwing", () => {
    const opts = { ...DEFAULT_OPTIONS, maxPriceSwing: 0.5 };
    expect(priceModifier(opts.maxStanding, opts, "buy")).toBeCloseTo(0.5, 10);
    expect(priceModifier(opts.maxStanding, opts, "sell")).toBeCloseTo(1.5, 10);
  });
});

describe("FactionRegistry disposition / docking / price wiring", () => {
  test("disposition is an alias for classify", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 40);
    expect(reg.disposition("p1", "Federation")).toBe("friendly");
    reg.setStanding("p1", "Pirates", -50);
    expect(reg.disposition("p1", "Pirates")).toBe("hostile");
  });

  test("dockingPermitted reflects standing through the helper", () => {
    const reg = new FactionRegistry();
    expect(reg.dockingPermitted("p1", "Federation")).toBe(true); // neutral default
    reg.setStanding("p1", "Pirates", -60);
    expect(reg.dockingPermitted("p1", "Pirates")).toBe(false);
    reg.setStanding("p1", "Pirates", 50);
    expect(reg.dockingPermitted("p1", "Pirates")).toBe(true);
  });

  test("priceModifier on the registry honors stored standings and mode", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", reg.options.maxStanding);
    const buy = reg.priceModifier("p1", "Federation", "buy");
    const sell = reg.priceModifier("p1", "Federation", "sell");
    expect(buy).toBeCloseTo(1 - reg.options.maxPriceSwing, 10);
    expect(sell).toBeCloseTo(1 + reg.options.maxPriceSwing, 10);
  });

  test("price modifier defaults to buy mode", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", reg.options.maxStanding);
    expect(reg.priceModifier("p1", "Federation")).toBe(
      reg.priceModifier("p1", "Federation", "buy"),
    );
  });
});

describe("FactionRegistry.factionPolicy view", () => {
  test("exposes pairwise relation queries derived from the relations table", () => {
    const reg = new FactionRegistry();
    const policy = reg.factionPolicy();
    expect(policy.getRelation("Federation", "Pirates")).toBe("enemy");
    expect(policy.isHostile("Federation", "Pirates")).toBe(true);
    expect(policy.isAllied("Federation", "Independents")).toBe(true);
    expect(policy.isHostile("Federation", "Independents")).toBe(false);
    expect(policy.isHostile("Federation", "Frontier League")).toBe(false);
  });

  test("self-vs-self is neutral, never hostile or allied", () => {
    const reg = new FactionRegistry();
    const policy = reg.factionPolicy();
    expect(policy.getRelation("Federation", "Federation")).toBe("neutral");
    expect(policy.isHostile("Federation", "Federation")).toBe(false);
    expect(policy.isAllied("Federation", "Federation")).toBe(false);
  });

  test("policy view is frozen so AI can rely on its shape", () => {
    const reg = new FactionRegistry();
    const policy = reg.factionPolicy();
    expect(Object.isFrozen(policy)).toBe(true);
  });
});

describe("FactionRegistry determinism and serialization", () => {
  test("identical operation sequences produce identical state", () => {
    const a = new FactionRegistry();
    const b = new FactionRegistry();
    const seq = [
      ["p1", "Federation", 30],
      ["p1", "Pirates", -10],
      ["p2", "Independents", 25],
      ["p1", "Federation", -5],
    ];
    for (const [player, faction, delta] of seq) {
      a.adjustStanding(player, faction, delta);
      b.adjustStanding(player, faction, delta);
    }
    expect(a.serialize().standings).toEqual(b.serialize().standings);
  });

  test("serialize -> fromJSON round-trips the live state", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", 40);
    reg.adjustStanding("p2", "Pirates", 20);
    const snapshot = reg.serialize();
    const restored = FactionRegistry.fromJSON(snapshot);
    expect(restored.getStanding("p1", "Federation")).toBe(
      reg.getStanding("p1", "Federation"),
    );
    expect(restored.getStanding("p1", "Independents")).toBe(
      reg.getStanding("p1", "Independents"),
    );
    expect(restored.getStanding("p2", "Pirates")).toBe(
      reg.getStanding("p2", "Pirates"),
    );
    expect(restored.serialize().standings).toEqual(snapshot.standings);
  });

  test("serialize output is a defensive copy — mutating it does not affect live state", () => {
    const reg = new FactionRegistry();
    reg.setStanding("p1", "Federation", 25);
    const snapshot = reg.serialize();
    snapshot.standings.p1.Federation = 999;
    expect(reg.getStanding("p1", "Federation")).toBe(25);
  });

  test("serialize output is JSON-safe (no functions, no cycles)", () => {
    const reg = new FactionRegistry();
    reg.adjustStanding("p1", "Federation", 15);
    const json = JSON.stringify(reg.serialize());
    const parsed = JSON.parse(json);
    expect(parsed.standings.p1.Federation).toBe(15);
  });
});
