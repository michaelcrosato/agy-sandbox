import {
  createSeededRng,
  generateMissionsFromWorld,
  applyMissionConsequences,
  DEFAULT_GENERATIVE_OPTIONS,
} from "./GenerativeMissions.js";
import { MissionManager } from "./MissionManager.js";
import { FactionRegistry } from "./FactionRegistry.js";
import { Ship } from "./Ship.js";

// A tiny world snapshot the generator can chew on without dragging in the
// real Planet class (the module only reads `name` + `market` from planets).
function makeWorld() {
  return {
    planets: [
      { name: "Sol", market: { food: 100, electronics: 300, minerals: 150 } },
      {
        name: "New Polaris",
        market: { food: 220, electronics: 320, minerals: 50 },
      },
      {
        name: "Sigma Draconis",
        market: { food: 120, electronics: 120, minerals: 250 },
      },
    ],
    baseMarkets: {
      Sol: { food: 100, electronics: 300, minerals: 150 },
      "New Polaris": { food: 100, electronics: 300, minerals: 150 },
      "Sigma Draconis": { food: 100, electronics: 300, minerals: 150 },
    },
    planetFactions: {
      Sol: "Federation",
      "New Polaris": "Frontier League",
      "Sigma Draconis": "Independents",
    },
    bountyTargets: [
      {
        name: "Karr 12",
        faction: "Pirates",
        locationPlanet: "Sigma Draconis",
        bounty: 800,
      },
      { name: "Void Serpent 33", faction: "Pirates", bounty: 1200 },
    ],
    playerId: "player-1",
  };
}

describe("createSeededRng", () => {
  test("yields identical streams for identical seeds", () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 16; i++) {
      expect(a()).toBe(b());
    }
  });

  test("yields different streams for different seeds", () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    const ax = [a(), a(), a(), a()];
    const bx = [b(), b(), b(), b()];
    expect(ax).not.toEqual(bx);
  });

  test("never falls into the degenerate-zero state", () => {
    const rng = createSeededRng(0);
    for (let i = 0; i < 32; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("generateMissionsFromWorld — input validation", () => {
  test("throws without an injected RNG", () => {
    expect(() => generateMissionsFromWorld(makeWorld(), {})).toThrow(
      /requires options\.rng/,
    );
  });

  test("returns an empty list when the world is empty", () => {
    const list = generateMissionsFromWorld({}, { rng: createSeededRng(1) });
    expect(list).toEqual([]);
  });

  test("returns an empty list when no shortages clear the threshold and no targets exist", () => {
    const world = {
      planets: [
        { name: "A", market: { food: 100 } },
        { name: "B", market: { food: 110 } },
      ],
      baseMarkets: { A: { food: 100 }, B: { food: 100 } },
    };
    const list = generateMissionsFromWorld(world, { rng: createSeededRng(7) });
    expect(list).toEqual([]);
  });
});

describe("generateMissionsFromWorld — delivery missions", () => {
  test("delivery missions only fire when both a shortage AND a surplus source exist", () => {
    // Sigma has a minerals surplus (250 vs baseline 150 is OVER baseline, not a surplus),
    // so build an explicit world where only one shortage has a viable surplus source.
    const world = {
      planets: [
        // Shortage but no surplus source: food at Sol is high; no other planet is cheap.
        { name: "Sol", market: { food: 200, electronics: 300 } },
        { name: "Mirror", market: { food: 200, electronics: 300 } },
        // Surplus source for electronics at Spark.
        { name: "Spark", market: { food: 200, electronics: 200 } },
        // Shortage for electronics at Sink.
        { name: "Sink", market: { food: 100, electronics: 600 } },
      ],
      baseMarkets: {
        Sol: { food: 100, electronics: 300 },
        Mirror: { food: 100, electronics: 300 },
        Spark: { food: 100, electronics: 300 },
        Sink: { food: 100, electronics: 300 },
      },
    };
    const list = generateMissionsFromWorld(world, {
      rng: createSeededRng(1),
    });
    const deliveries = list.filter((m) => m.type === "delivery");
    // Only the electronics shortage on Sink can be sourced (from Spark at 200).
    expect(deliveries.length).toBe(1);
    expect(deliveries[0].cargoItem).toBe("electronics");
    expect(deliveries[0].destination).toBe("Sink");
    expect(deliveries[0].origin).toBe("Spark");
  });

  test("delivery references the actual shortage and source prices from the snapshot", () => {
    // In the default world snapshot, the highest-ratio shortage IS New
    // Polaris food (220/100 = 2.2), but no other planet sits at ≤ 0.85 of
    // baseline for food — so the generator skips it. The first emit-able
    // shortage is Sigma Draconis minerals (250/150 ≈ 1.67), sourced from
    // New Polaris minerals (50/100 = 0.5, well under the surplus ratio).
    const world = makeWorld();
    const list = generateMissionsFromWorld(world, {
      rng: createSeededRng(123),
    });
    const delivery = list.find((m) => m.type === "delivery");
    expect(delivery).toBeDefined();
    expect(delivery.destination).toBe("Sigma Draconis");
    expect(delivery.cargoItem).toBe("minerals");
    expect(delivery.shortagePrice).toBe(250);
    expect(delivery.baselinePrice).toBe(150);
    expect(delivery.origin).toBe("New Polaris");
    expect(delivery.sourcePrice).toBe(50);
    expect(delivery.sourcePrice).toBeLessThanOrEqual(
      DEFAULT_GENERATIVE_OPTIONS.surplusRatio * delivery.baselinePrice,
    );
    // The mission's destination must actually be a planet in the snapshot.
    expect(world.planets.some((p) => p.name === delivery.destination)).toBe(
      true,
    );
    expect(world.planets.some((p) => p.name === delivery.origin)).toBe(true);
  });

  test("delivery rewards scale with the price gap and cargo amount", () => {
    const world = {
      planets: [
        { name: "Sink", market: { minerals: 400 } },
        { name: "Mine", market: { minerals: 50 } },
      ],
      baseMarkets: {
        Sink: { minerals: 150 },
        Mine: { minerals: 150 },
      },
    };
    const list = generateMissionsFromWorld(world, {
      rng: createSeededRng(99),
      tuning: { cargoMin: 4, cargoMax: 4 }, // pin cargo to 4 tons
    });
    expect(list.length).toBe(1);
    const m = list[0];
    expect(m.cargoAmount).toBe(4);
    expect(m.priceGap).toBe(350); // 400 - 50
    // baseDeliveryReward (500) + 350 * 4 * 1.5 = 500 + 2100 = 2600
    expect(m.reward).toBe(2600);
    expect(m.cargoItem).toBe("minerals");
    expect(m.origin).toBe("Mine");
    expect(m.destination).toBe("Sink");
  });

  test("two callers with the same seed produce identical delivery lists", () => {
    const a = generateMissionsFromWorld(makeWorld(), {
      rng: createSeededRng(2026),
    });
    const b = generateMissionsFromWorld(makeWorld(), {
      rng: createSeededRng(2026),
    });
    expect(a).toEqual(b);
  });

  test("different seeds may roll different cargo amounts but the same shape", () => {
    const a = generateMissionsFromWorld(makeWorld(), {
      rng: createSeededRng(1),
    });
    const b = generateMissionsFromWorld(makeWorld(), {
      rng: createSeededRng(2),
    });
    // Destinations/sources/commodities come from the deterministic shortage
    // sort — only cargo amount (and the reward derived from it) is RNG-driven.
    const fingerprint = (list) =>
      list
        .filter((m) => m.type === "delivery")
        .map((m) => ({
          origin: m.origin,
          destination: m.destination,
          cargoItem: m.cargoItem,
          shortagePrice: m.shortagePrice,
          sourcePrice: m.sourcePrice,
        }));
    expect(fingerprint(a)).toEqual(fingerprint(b));
  });

  test("delivery missions respect the maxDeliveryMissions cap", () => {
    const world = {
      planets: [
        // 3 deficit destinations: Sink1, Sink2, Sink3
        { name: "Sink1", market: { food: 300 } },
        { name: "Sink2", market: { electronics: 600 } },
        { name: "Sink3", market: { minerals: 500 } },
        // Source planets stocked with all 3 commodities at surplus prices
        {
          name: "Source",
          market: { food: 60, electronics: 200, minerals: 80 },
        },
      ],
      baseMarkets: {
        Sink1: { food: 100, electronics: 300, minerals: 150 },
        Sink2: { food: 100, electronics: 300, minerals: 150 },
        Sink3: { food: 100, electronics: 300, minerals: 150 },
        Source: { food: 100, electronics: 300, minerals: 150 },
      },
    };
    const list = generateMissionsFromWorld(world, {
      rng: createSeededRng(5),
      tuning: { maxDeliveryMissions: 2 },
    });
    expect(list.filter((m) => m.type === "delivery").length).toBe(2);
  });
});

describe("generateMissionsFromWorld — hunt missions", () => {
  test("hunt missions are created for each provided bounty target", () => {
    const world = makeWorld();
    const list = generateMissionsFromWorld(world, {
      rng: createSeededRng(11),
    });
    const hunts = list.filter((m) => m.type === "hunt");
    expect(hunts.length).toBe(2);
    expect(hunts.map((h) => h.targetName)).toEqual([
      "Karr 12",
      "Void Serpent 33",
    ]);
    for (const hunt of hunts) {
      expect(hunt.targetFaction).toBe("Pirates");
      expect(hunt.reward).toBeGreaterThan(
        DEFAULT_GENERATIVE_OPTIONS.baseHuntReward,
      );
    }
  });

  test("hunt missions skip targets with empty names", () => {
    const list = generateMissionsFromWorld(
      {
        bountyTargets: [
          { name: "", faction: "Pirates" },
          { name: null, faction: "Pirates" },
          { name: "Valid Target" },
        ],
      },
      { rng: createSeededRng(1) },
    );
    const hunts = list.filter((m) => m.type === "hunt");
    expect(hunts.length).toBe(1);
    expect(hunts[0].targetName).toBe("Valid Target");
  });

  test("hunt missions respect maxHuntMissions cap", () => {
    const list = generateMissionsFromWorld(
      {
        bountyTargets: [
          { name: "A", bounty: 100 },
          { name: "B", bounty: 100 },
          { name: "C", bounty: 100 },
          { name: "D", bounty: 100 },
        ],
      },
      {
        rng: createSeededRng(1),
        tuning: { maxHuntMissions: 2 },
      },
    );
    expect(list.length).toBe(2);
    expect(list.map((m) => m.targetName)).toEqual(["A", "B"]);
  });

  test("hunt rewards scale with the target's bounty value", () => {
    const list = generateMissionsFromWorld(
      { bountyTargets: [{ name: "Boss", bounty: 500 }] },
      {
        rng: createSeededRng(1),
      },
    );
    // baseHuntReward (1500) + 500 * huntRewardScale (4) = 3500
    expect(list[0].reward).toBe(3500);
  });
});

describe("generateMissionsFromWorld — graceful degradation", () => {
  test("omits delivery missions when baseMarkets is missing", () => {
    const list = generateMissionsFromWorld(
      {
        planets: [
          { name: "Sink", market: { food: 500 } },
          { name: "Mine", market: { food: 50 } },
        ],
        bountyTargets: [{ name: "Solo" }],
      },
      { rng: createSeededRng(1) },
    );
    expect(list.filter((m) => m.type === "delivery").length).toBe(0);
    expect(list.filter((m) => m.type === "hunt").length).toBe(1);
  });

  test("omits hunt missions when bountyTargets is missing", () => {
    const list = generateMissionsFromWorld(
      {
        planets: [
          { name: "Sink", market: { food: 500 } },
          { name: "Mine", market: { food: 50 } },
        ],
        baseMarkets: {
          Sink: { food: 100 },
          Mine: { food: 100 },
        },
      },
      { rng: createSeededRng(1) },
    );
    expect(list.filter((m) => m.type === "hunt").length).toBe(0);
    expect(list.filter((m) => m.type === "delivery").length).toBe(1);
  });

  test("attaches no faction deltas when planetFactions/factions are absent", () => {
    const list = generateMissionsFromWorld(
      {
        planets: [
          { name: "Sink", market: { food: 500 } },
          { name: "Mine", market: { food: 50 } },
        ],
        baseMarkets: { Sink: { food: 100 }, Mine: { food: 100 } },
        bountyTargets: [{ name: "Loner" }],
      },
      { rng: createSeededRng(1) },
    );
    for (const mission of list) {
      expect(mission.consequences.factionDeltas).toEqual([]);
    }
  });
});

describe("applyMissionConsequences", () => {
  test("delivery completion nudges the destination market downward but never below baseline", () => {
    const planets = [
      { name: "Sink", market: { food: 220 } },
      { name: "Mine", market: { food: 50 } },
    ];
    const baseMarkets = { Sink: { food: 100 }, Mine: { food: 100 } };
    const list = generateMissionsFromWorld(
      { planets, baseMarkets },
      {
        rng: createSeededRng(1),
        tuning: { cargoMin: 4, cargoMax: 4 }, // 4 * marketReliefPerUnit(4) = 16
      },
    );
    const delivery = list.find((m) => m.type === "delivery");
    const before = planets[0].market.food;
    const result = applyMissionConsequences(delivery, { planets, baseMarkets });
    expect(result.marketChanges.length).toBe(1);
    expect(result.marketChanges[0].before).toBe(before);
    expect(result.marketChanges[0].after).toBe(before - 16);
    expect(planets[0].market.food).toBe(before - 16);
  });

  test("relief never drives the destination market below its baseline price", () => {
    const planets = [
      { name: "Sink", market: { food: 105 } }, // just above baseline
      { name: "Mine", market: { food: 50 } },
    ];
    const baseMarkets = { Sink: { food: 100 }, Mine: { food: 100 } };
    // Construct the mission by hand so it survives our shortage filter
    // (the planet barely qualifies; we just want to exercise the floor).
    const mission = {
      type: "delivery",
      generated: true,
      consequences: {
        marketRelief: {
          planetName: "Sink",
          commodity: "food",
          priceDelta: 100,
        },
      },
    };
    applyMissionConsequences(mission, { planets, baseMarkets });
    expect(planets[0].market.food).toBe(100); // clamped at baseline
  });

  test("delivery completion applies the destination-faction standing delta", () => {
    const registry = new FactionRegistry();
    const planets = [
      { name: "Sink", market: { food: 220 } },
      { name: "Mine", market: { food: 50 } },
    ];
    const baseMarkets = { Sink: { food: 100 }, Mine: { food: 100 } };
    const planetFactions = { Sink: "Federation", Mine: "Federation" };
    const list = generateMissionsFromWorld(
      { planets, baseMarkets, planetFactions, playerId: "alpha" },
      {
        rng: createSeededRng(1),
        tuning: { deliveryFactionDelta: 5 },
      },
    );
    const delivery = list.find((m) => m.type === "delivery");
    expect(delivery.consequences.factionDeltas[0]).toEqual({
      playerId: "alpha",
      faction: "Federation",
      delta: 5,
    });

    expect(registry.getStanding("alpha", "Federation")).toBe(0);
    applyMissionConsequences(delivery, {
      planets,
      baseMarkets,
      factionRegistry: registry,
    });
    expect(registry.getStanding("alpha", "Federation")).toBe(5);
    // Federation's allies (Independents) should have moved with it.
    expect(registry.getStanding("alpha", "Independents")).toBeGreaterThan(0);
  });

  test("hunt completion subtracts standing from the target's faction", () => {
    const registry = new FactionRegistry();
    const list = generateMissionsFromWorld(
      {
        bountyTargets: [{ name: "Karr 12", faction: "Pirates", bounty: 500 }],
        playerId: "alpha",
      },
      { rng: createSeededRng(1), tuning: { huntFactionDelta: 8 } },
    );
    const hunt = list.find((m) => m.type === "hunt");
    expect(hunt.consequences.factionDeltas[0]).toEqual({
      playerId: "alpha",
      faction: "Pirates",
      delta: -8,
    });
    applyMissionConsequences(hunt, { factionRegistry: registry });
    expect(registry.getStanding("alpha", "Pirates")).toBe(-8);
    // Pirates' enemies (Federation, Frontier League) should gain from a Pirate hit.
    expect(registry.getStanding("alpha", "Federation")).toBeGreaterThan(0);
    expect(registry.getStanding("alpha", "Frontier League")).toBeGreaterThan(0);
  });

  test("no-op when factionRegistry is absent", () => {
    const planets = [
      { name: "Sink", market: { food: 220 } },
      { name: "Mine", market: { food: 50 } },
    ];
    const baseMarkets = { Sink: { food: 100 }, Mine: { food: 100 } };
    const list = generateMissionsFromWorld(
      {
        planets,
        baseMarkets,
        planetFactions: { Sink: "Federation" },
        playerId: "alpha",
      },
      { rng: createSeededRng(1) },
    );
    const result = applyMissionConsequences(list[0], { planets, baseMarkets });
    expect(result.factionChanges).toEqual([]);
    // Market change still recorded.
    expect(result.marketChanges.length).toBe(1);
  });

  test("returns a benign empty result for a mission with no consequences block", () => {
    expect(applyMissionConsequences({ type: "delivery" })).toEqual({
      marketChanges: [],
      factionChanges: [],
    });
    expect(applyMissionConsequences(null)).toEqual({
      marketChanges: [],
      factionChanges: [],
    });
  });
});

describe("MissionManager.generateWorldMissions integration", () => {
  test("appends generated missions to the planet's available list", () => {
    const mm = new MissionManager();
    const world = makeWorld();
    const generated = mm.generateWorldMissions("Sol", world, {
      rng: createSeededRng(7),
    });
    expect(generated.length).toBeGreaterThan(0);
    expect(mm.availableMissions["Sol"]).toEqual(generated);
  });

  test("does not stomp pre-existing available missions on the same planet", () => {
    const mm = new MissionManager();
    const placeholder = { id: "existing-1", type: "courier" };
    mm.availableMissions["Sol"] = [placeholder];
    mm.generateWorldMissions("Sol", makeWorld(), { rng: createSeededRng(1) });
    expect(mm.availableMissions["Sol"][0]).toBe(placeholder);
    expect(mm.availableMissions["Sol"].length).toBeGreaterThan(1);
  });

  test("generated missions can be accepted via the existing acceptMission flow", () => {
    const mm = new MissionManager();
    const world = makeWorld();
    const generated = mm.generateWorldMissions("Sol", world, {
      rng: createSeededRng(42),
    });
    const delivery = generated.find((m) => m.type === "delivery");
    expect(delivery).toBeDefined();
    const player = new Ship({ credits: 5000, cargoCapacity: 20 });
    const res = mm.acceptMission("Sol", delivery.id, player);
    expect(res.success).toBe(true);
    expect(player.cargo[delivery.cargoItem]).toBe(delivery.cargoAmount);
    expect(mm.activeMissions).toContain(delivery);
  });
});

describe("MissionManager.completeGeneratedMission integration", () => {
  test("pays out reward, unloads cargo, mutates market, and shifts standing", () => {
    const mm = new MissionManager();
    const registry = new FactionRegistry();
    const world = {
      planets: [
        { name: "Sink", market: { food: 220 } },
        { name: "Mine", market: { food: 50 } },
      ],
      baseMarkets: { Sink: { food: 100 }, Mine: { food: 100 } },
      planetFactions: { Sink: "Federation", Mine: "Frontier League" },
      playerId: "alpha",
      factionRegistry: registry,
    };
    const generated = mm.generateWorldMissions("Mine", world, {
      rng: createSeededRng(13),
      tuning: { cargoMin: 3, cargoMax: 3, deliveryFactionDelta: 4 },
    });
    const delivery = generated.find((m) => m.type === "delivery");
    const player = new Ship({ credits: 1000, cargoCapacity: 20 });

    const acceptRes = mm.acceptMission("Mine", delivery.id, player);
    expect(acceptRes.success).toBe(true);
    expect(player.cargo.food).toBe(3);

    const sinkMarketBefore = world.planets[0].market.food;
    const result = mm.completeGeneratedMission(delivery.id, player, world);

    expect(result).not.toBeNull();
    expect(result.mission.id).toBe(delivery.id);
    expect(mm.activeMissions.length).toBe(0);
    expect(player.cargo.food).toBe(0);
    expect(player.credits).toBe(1000 + delivery.reward);
    expect(world.planets[0].market.food).toBeLessThan(sinkMarketBefore);
    expect(registry.getStanding("alpha", "Federation")).toBe(4);
  });

  test("returns null for an id that is not an active generated mission", () => {
    const mm = new MissionManager();
    mm.activeMissions = [{ id: "courier-1", type: "courier" }]; // not `generated:true`
    const player = new Ship();
    expect(mm.completeGeneratedMission("courier-1", player, {})).toBeNull();
    expect(mm.completeGeneratedMission("ghost", player, {})).toBeNull();
  });

  test("hunt-completion applies negative standing to the target's faction", () => {
    const mm = new MissionManager();
    const registry = new FactionRegistry();
    const world = {
      bountyTargets: [{ name: "Karr 12", faction: "Pirates", bounty: 400 }],
      playerId: "alpha",
      factionRegistry: registry,
    };
    const generated = mm.generateWorldMissions("Sol", world, {
      rng: createSeededRng(1),
      tuning: { huntFactionDelta: 7 },
    });
    const hunt = generated.find((m) => m.type === "hunt");
    mm.acceptMission("Sol", hunt.id, new Ship());
    const player = new Ship({ credits: 100 });
    const result = mm.completeGeneratedMission(hunt.id, player, world);
    expect(result).not.toBeNull();
    expect(player.credits).toBe(100 + hunt.reward);
    expect(registry.getStanding("alpha", "Pirates")).toBe(-7);
  });
});
