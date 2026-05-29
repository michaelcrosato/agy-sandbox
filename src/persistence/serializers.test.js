import { GameInstance } from "../engine/GameInstance.js";
import { FactionRegistry } from "../engine/FactionRegistry.js";
import { MissionManager } from "../engine/MissionManager.js";
import { Ship } from "../engine/Ship.js";

import { InMemoryStore } from "./Store.js";
import {
  applyGalaxy,
  applyPlayer,
  serializeGalaxy,
  serializePlayer,
  SNAPSHOT_VERSION,
} from "./serializers.js";

/**
 * Helper: build a tiny stub `gameInstance` shape compatible with the
 * serializers but free of timers, Math.random spawning, and engine state.
 * Used by the focused unit tests; the round-trip-on-a-real-GameInstance
 * test below exercises the real shape end-to-end.
 */
function makeStubInstance() {
  return {
    planets: [
      { name: "Sol", market: { food: 100, electronics: 300 } },
      { name: "New Polaris", market: { food: 220, electronics: 320 } },
    ],
    economyManager: {
      activeEconomicEvent: null,
      eventDurationTimer: 0,
    },
    activeSectorEvent: null,
    galaxyHeartbeat: { pulses: 0 },
  };
}

describe("serializeGalaxy / applyGalaxy", () => {
  test("captures planet markets, events, heartbeat pulses, and faction state", () => {
    const a = makeStubInstance();
    a.planets[0].market.food = 175;
    a.economyManager.activeEconomicEvent = {
      planetName: "Sol",
      commodity: "food",
      originalPrice: 100,
      newPrice: 175,
      isShortage: true,
      type: "shortage",
    };
    a.economyManager.eventDurationTimer = 12;
    a.activeSectorEvent = {
      type: "siege",
      planetName: "New Polaris",
      spawnedShipIds: ["raider-1", "raider-2"],
    };
    a.galaxyHeartbeat.pulses = 42;
    a.factionRegistry = new FactionRegistry();
    a.factionRegistry.adjustStanding("p1", "Federation", 25);

    const snap = serializeGalaxy(a);

    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.planets).toEqual([
      { name: "Sol", market: { food: 175, electronics: 300 } },
      { name: "New Polaris", market: { food: 220, electronics: 320 } },
    ]);
    expect(snap.activeEconomicEvent.commodity).toBe("food");
    expect(snap.eventDurationTimer).toBe(12);
    expect(snap.activeSectorEvent.type).toBe("siege");
    expect(snap.activeSectorEvent.spawnedShipIds).toEqual([
      "raider-1",
      "raider-2",
    ]);
    expect(snap.heartbeatPulses).toBe(42);
    expect(snap.factionRegistry.standings.p1.Federation).toBe(25);
  });

  test("round-trip on stubs: applyGalaxy(B, serializeGalaxy(A)) makes B match A", () => {
    const a = makeStubInstance();
    a.planets[0].market.food = 333;
    a.planets[1].market.electronics = 412;
    a.economyManager.activeEconomicEvent = {
      planetName: "New Polaris",
      commodity: "electronics",
      originalPrice: 320,
      newPrice: 412,
      isShortage: true,
      type: "shortage",
    };
    a.economyManager.eventDurationTimer = 7.5;
    a.activeSectorEvent = {
      type: "emp",
      planetName: "Sol",
      spawnedShipIds: [],
    };
    a.galaxyHeartbeat.pulses = 17;
    a.factionRegistry = new FactionRegistry();
    a.factionRegistry.adjustStanding("p2", "Pirates", -40);

    const b = makeStubInstance();
    b.factionRegistry = new FactionRegistry();

    applyGalaxy(b, serializeGalaxy(a));

    expect(b.planets[0].market).toEqual(a.planets[0].market);
    expect(b.planets[1].market).toEqual(a.planets[1].market);
    expect(b.economyManager.activeEconomicEvent).toEqual(
      a.economyManager.activeEconomicEvent,
    );
    expect(b.economyManager.eventDurationTimer).toBe(7.5);
    expect(b.activeSectorEvent).toEqual(a.activeSectorEvent);
    expect(b.galaxyHeartbeat.pulses).toBe(17);
    expect(b.factionRegistry.getStanding("p2", "Pirates")).toBe(-40);
  });

  test("round-trip survives JSON.stringify through an InMemoryStore", async () => {
    const a = makeStubInstance();
    a.planets[0].market.food = 188;
    a.galaxyHeartbeat.pulses = 9;

    const store = new InMemoryStore();
    await store.save("galaxy", serializeGalaxy(a));
    // Force a true JSON round-trip (the store already does this internally
    // via cloneJson, but we belt-and-suspenders it here so the test asserts
    // the snapshot is JSON-safe even outside that path).
    const reloaded = JSON.parse(JSON.stringify(await store.load("galaxy")));

    const b = makeStubInstance();
    applyGalaxy(b, reloaded);

    expect(b.planets[0].market.food).toBe(188);
    expect(b.galaxyHeartbeat.pulses).toBe(9);
  });

  test("snapshot snapshots are not aliased with live state (no shared references)", () => {
    const a = makeStubInstance();
    a.planets[0].market.food = 200;
    const snap = serializeGalaxy(a);
    // Mutating the live planet must not bleed into the snapshot.
    a.planets[0].market.food = 999;
    expect(snap.planets[0].market.food).toBe(200);
  });

  test("apply tolerates planets present in snapshot but absent on target", () => {
    const a = makeStubInstance();
    a.planets[0].market.food = 250;

    const b = {
      planets: [{ name: "Sol", market: { food: 100, electronics: 300 } }],
      economyManager: { activeEconomicEvent: null, eventDurationTimer: 0 },
      activeSectorEvent: null,
      galaxyHeartbeat: { pulses: 0 },
    };

    applyGalaxy(b, serializeGalaxy(a));

    expect(b.planets).toHaveLength(1);
    expect(b.planets[0].market.food).toBe(250);
  });

  test("apply with a missing snapshot or instance is a no-op", () => {
    const a = makeStubInstance();
    expect(() => applyGalaxy(a, null)).not.toThrow();
    expect(() => applyGalaxy(null, serializeGalaxy(a))).not.toThrow();
  });

  test("round-trip on a real GameInstance restores heartbeat-aged markets", () => {
    const instanceA = new GameInstance("room-a", "Alpha");
    const instanceB = new GameInstance("room-b", "Beta");
    try {
      // Age the economy on A only — flip a couple of prices to obvious values
      // and bump the pulse count so the snapshot has work to do on restore.
      const solA = instanceA.planets.find((p) => p.name === "Sol");
      solA.market.food = 999;
      solA.market.electronics = 42;
      instanceA.galaxyHeartbeat.pulses = 21;
      instanceA.activeSectorEvent = {
        type: "siege",
        planetName: "Sol",
        spawnedShipIds: ["sx-1"],
      };

      // Sanity: B starts on the seeded baselines, NOT A's aged values.
      const solB = instanceB.planets.find((p) => p.name === "Sol");
      expect(solB.market.food).not.toBe(999);

      applyGalaxy(instanceB, serializeGalaxy(instanceA));

      // Now every planet's market on B should match A's.
      for (const planetA of instanceA.planets) {
        const planetB = instanceB.planets.find((p) => p.name === planetA.name);
        expect(planetB.market).toEqual(planetA.market);
      }
      expect(instanceB.galaxyHeartbeat.pulses).toBe(21);
      expect(instanceB.activeSectorEvent).toEqual(instanceA.activeSectorEvent);
    } finally {
      // Cancel the AI-respawn timers each GameInstance schedules, so they
      // never keep the Jest runner alive after the test exits.
      instanceA.destroy();
      instanceB.destroy();
    }
  });
});

describe("serializePlayer / applyPlayer", () => {
  function makeClient({ nickname = "Test", id = "player-x" } = {}) {
    const ship = new Ship({
      id,
      name: "Player Hull",
      maxShield: 250,
      maxArmor: 120,
      credits: 4200,
      cargoCapacity: 25,
    });
    const missionManager = new MissionManager();
    return {
      id,
      nickname,
      ship,
      missionManager,
    };
  }

  test("captures credits, cargo, outfits, hull stats, pierce, nickname", () => {
    const client = makeClient();
    client.ship.credits = 7777;
    client.ship.addCargo("food", 5);
    client.ship.addCargo("electronics", 2);
    client.ship.outfits.push("Heavy Shields");
    client.ship.addOutfitMass(800);
    client.ship.maxShield = 550;
    client.ship.shield = 550;
    client.ship.weaponShieldPierce = 0.5;

    const snap = serializePlayer(client);

    expect(snap.version).toBe(SNAPSHOT_VERSION);
    expect(snap.nickname).toBe("Test");
    expect(snap.ship.credits).toBe(7777);
    expect(snap.ship.cargo).toEqual({
      food: 5,
      electronics: 2,
      minerals: 0,
      luxuries: 0,
      contraband: 0,
      machinery: 0,
    });
    expect(snap.ship.outfits).toEqual(["Basic Laser", "Heavy Shields"]);
    expect(snap.ship.weaponShieldPierce).toBe(0.5);
    expect(snap.ship.hull.maxShield).toBe(550);
    expect(snap.ship.hull.outfitMass).toBe(800);
    expect(snap.ship.hull.hullMass).toBeGreaterThan(0);
  });

  test("round-trip: applyPlayer(B, serializePlayer(A)) makes B match A", () => {
    const a = makeClient({ nickname: "Alpha", id: "player-a" });
    a.ship.credits = 1234;
    a.ship.addCargo("minerals", 3);
    a.ship.outfits.push("Aegis Shield Matrix");
    a.ship.weaponShieldPierce = 0.7;
    a.ship.maxShield = 1000;
    a.ship.shield = 850;
    a.ship.cargoCapacity = 65;
    a.ship.thrustPower = 26000;
    a.ship.turnRate = 1.8;
    a.ship.addOutfitMass(1500);
    a.missionManager.activeMissions.push({
      id: "m1",
      type: "courier",
      title: "Test Run",
      reward: 500,
      destination: "Sol",
      cargoItem: "food",
      cargoAmount: 2,
      isAccepted: true,
      isCompleted: false,
    });
    a.missionManager.availableMissions["Sol"] = [
      {
        id: "m2",
        type: "bounty",
        title: "Hunt",
        reward: 4000,
        destination: "Sol",
        targetName: "Void Serpent 12",
        isAccepted: false,
        isCompleted: false,
      },
    ];
    a.missionManager.storylineCompleted = true;

    const b = makeClient({ nickname: "Beta", id: "player-b" });

    applyPlayer(b, serializePlayer(a));

    expect(b.nickname).toBe("Alpha");
    expect(b.ship.credits).toBe(1234);
    expect(b.ship.cargo).toEqual(a.ship.cargo);
    expect(b.ship.outfits).toEqual(a.ship.outfits);
    expect(b.ship.weaponShieldPierce).toBe(0.7);
    expect(b.ship.maxShield).toBe(1000);
    expect(b.ship.shield).toBe(850);
    expect(b.ship.cargoCapacity).toBe(65);
    expect(b.ship.thrustPower).toBe(26000);
    expect(b.ship.turnRate).toBe(1.8);
    expect(b.ship.outfitMass).toBe(1500);
    // SpaceEntity mass must be re-derived from hull + outfit so physics stays consistent.
    expect(b.ship.mass).toBe(b.ship.hullMass + b.ship.outfitMass);
    expect(b.missionManager.activeMissions).toHaveLength(1);
    expect(b.missionManager.activeMissions[0].id).toBe("m1");
    expect(b.missionManager.availableMissions["Sol"][0].id).toBe("m2");
    expect(b.missionManager.storylineCompleted).toBe(true);
  });

  test("round-trip survives JSON.stringify through an InMemoryStore", async () => {
    const a = makeClient();
    a.ship.credits = 9000;
    a.ship.weaponShieldPierce = 0.25;

    const store = new InMemoryStore();
    await store.save("player-a", serializePlayer(a));
    const reloaded = JSON.parse(JSON.stringify(await store.load("player-a")));

    const b = makeClient();
    applyPlayer(b, reloaded);

    expect(b.ship.credits).toBe(9000);
    expect(b.ship.weaponShieldPierce).toBe(0.25);
  });

  test("apply tolerates missing snapshot or missing client", () => {
    const a = makeClient();
    expect(() => applyPlayer(a, null)).not.toThrow();
    expect(() => applyPlayer(null, serializePlayer(a))).not.toThrow();
  });

  test("active mission list is decoupled from live state (no shared references)", () => {
    const a = makeClient();
    a.missionManager.activeMissions.push({
      id: "m1",
      type: "courier",
      title: "Live",
      reward: 100,
    });
    const snap = serializePlayer(a);

    // Mutate the live manager AFTER snapshot.
    a.missionManager.activeMissions[0].title = "MUTATED";

    const b = makeClient();
    applyPlayer(b, snap);
    expect(b.missionManager.activeMissions[0].title).toBe("Live");
  });
});
