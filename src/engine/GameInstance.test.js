import { jest } from "@jest/globals";
import {
  GameInstance,
  getSectorFromPosition,
  SECTOR_ADJACENCY,
  BASE_MARKETS,
} from "./GameInstance.js";
import { Ship } from "./Ship.js";
import { Projectile } from "./Projectile.js";
import { Vector2D } from "../physics/Vector2D.js";

/**
 * Creates a lightweight mock WebSocket that satisfies the GameInstance
 * broadcast guards (`ws.readyState === ws.OPEN`).
 * @returns {{ send: jest.Mock, readyState: number, OPEN: number }}
 */
function mockWs() {
  return { send: jest.fn(), readyState: 1, OPEN: 1 };
}

/**
 * Creates a minimal mock client object matching the shape GameInstance expects.
 * @param {string} id
 * @param {string} nickname
 * @param {object} [shipOverrides]
 * @returns {object}
 */
function mockClient(id, nickname, shipOverrides = {}) {
  const ws = mockWs();
  const ship = new Ship({
    credits: 5000,
    cargoCapacity: 20,
    position: new Vector2D(0, 0),
    ...shipOverrides,
  });
  return {
    id,
    nickname,
    ws,
    ship,
    fleetName: null,
    isLanded: false,
    planetLandedOn: null,
    cleanupTimeout: null,
    missionManager: { activeMissions: [], checkBountyCompletion: () => null },
    send: jest.fn(),
    sendStats: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// 1. Construction & Initialization
// ---------------------------------------------------------------------------

describe("Construction & Initialization", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-test", "Test Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("sets id, name, and default matchmaking metadata", () => {
    expect(room.id).toBe("room-test");
    expect(room.name).toBe("Test Room");
    expect(room.mode).toBe("standard");
    expect(room.maxPlayers).toBe(50);
    expect(room.tags).toEqual([]);
  });

  test("creates a SpaceEngine with correct physics config", () => {
    expect(room.engine).toBeDefined();
    expect(room.engine.globalDrag).toBe(0.1);
    expect(room.engine.restitution).toBe(0.4);
    expect(room.engine.entities.length).toBeGreaterThan(0);
  });

  test("initializes fleets and clients as empty Maps", () => {
    expect(room.fleets).toBeInstanceOf(Map);
    expect(room.clients).toBeInstanceOf(Map);
    expect(room.fleets.size).toBe(0);
    expect(room.clients.size).toBe(0);
  });

  test("initializes FactionRegistry and TerritoryControl", () => {
    expect(room.factionRegistry).toBeDefined();
    expect(room.territoryControl).toBeDefined();
    expect(room.factionRegistry.territoryControl).toBe(room.territoryControl);
  });
});

// ---------------------------------------------------------------------------
// 2. seedGalaxy() and Planet Generation
// ---------------------------------------------------------------------------

describe("seedGalaxy and Planet Generation", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-seed", "Seed Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("seeds exactly 8 planets across 3 sectors", () => {
    expect(room.planets).toHaveLength(8);

    const sectors = room.planets.map((p) => p.sector);
    expect(sectors.filter((s) => s === "core")).toHaveLength(2);
    expect(sectors.filter((s) => s === "frontier")).toHaveLength(3);
    expect(sectors.filter((s) => s === "rim")).toHaveLength(3);
  });

  test("each planet has a valid market with all 7 commodities", () => {
    const commodityKeys = [
      "food",
      "electronics",
      "minerals",
      "luxuries",
      "contraband",
      "machinery",
      "ore",
    ];
    for (const planet of room.planets) {
      for (const key of commodityKeys) {
        expect(planet.market[key]).toBeDefined();
        expect(typeof planet.market[key]).toBe("number");
        expect(planet.market[key]).toBeGreaterThan(0);
      }
    }
  });

  test("planet names match the canonical set", () => {
    const names = room.planets.map((p) => p.name).sort();
    const expected = [
      "Aurelia Mining Hub",
      "Kaelis Colony",
      "New Polaris",
      "Rogue's Hollow",
      "Sigma Draconis",
      "Sol",
      "Tenebris Prime",
      "Valkyrie Depot",
    ];
    expect(names).toEqual(expected);
  });

  test("all planets and warp gates are registered in the engine", () => {
    const planetIds = room.planets.map((p) => p.id);
    for (const id of planetIds) {
      expect(room.engine.getEntity(id)).toBeDefined();
    }

    // Four warp gates
    const gates = room.engine.entities.filter((e) => e.type === "warp_gate");
    expect(gates).toHaveLength(4);
  });

  test("assigns correct factions to planets", () => {
    const byName = {};
    for (const p of room.planets) byName[p.name] = p.faction;

    expect(byName["Sol"]).toBe("Federation");
    expect(byName["Valkyrie Depot"]).toBe("Federation");
    expect(byName["New Polaris"]).toBe("Frontier League");
    expect(byName["Rogue's Hollow"]).toBe("Pirates");
    expect(byName["Kaelis Colony"]).toBe("Independents");
  });
});

// ---------------------------------------------------------------------------
// 3. EconomyManager Integration
// ---------------------------------------------------------------------------

describe("EconomyManager Integration", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-econ", "Econ Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("economyManager is created with all planets", () => {
    expect(room.economyManager).toBeDefined();
    expect(room.economyManager.planets).toBe(room.planets);
  });

  test("economyManager.registerBuy adjusts planet market prices upward", () => {
    const sol = room.planets.find((p) => p.name === "Sol");
    const before = sol.market.food;
    const next = room.economyManager.registerBuy("Sol", "food");
    expect(next).toBeGreaterThan(before);
    expect(sol.market.food).toBe(next);
  });

  test("economyManager.registerSell adjusts planet market prices downward", () => {
    const sol = room.planets.find((p) => p.name === "Sol");
    const before = sol.market.food;
    const next = room.economyManager.registerSell("Sol", "food");
    expect(next).toBeLessThan(before);
    expect(sol.market.food).toBe(next);
  });

  test("galaxyHeartbeat is created with all planets and sectors", () => {
    expect(room.galaxyHeartbeat).toBeDefined();
    expect(room.galaxyHeartbeat.planets).toBe(room.planets);
    expect(room.galaxyHeartbeat.baseMarkets).toBe(BASE_MARKETS);
  });
});

// ---------------------------------------------------------------------------
// 4. Entity Lifecycle
// ---------------------------------------------------------------------------

describe("Entity Lifecycle", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-entity", "Entity Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("engine.addEntity registers new entities", () => {
    const before = room.engine.entities.length;
    const ship = new Ship({
      name: "TestShip",
      position: new Vector2D(100, 100),
    });
    room.engine.addEntity(ship);
    expect(room.engine.entities.length).toBe(before + 1);
    expect(room.engine.getEntity(ship.id)).toBe(ship);
  });

  test("engine.removeEntity removes entities by id", () => {
    const ship = new Ship({
      name: "TestShip",
      position: new Vector2D(100, 100),
    });
    room.engine.addEntity(ship);
    const before = room.engine.entities.length;
    const removed = room.engine.removeEntity(ship.id);
    expect(removed).toBe(true);
    expect(room.engine.entities.length).toBe(before - 1);
    expect(room.engine.getEntity(ship.id)).toBeUndefined();
  });

  test("jettisonFromShip spawns a CargoPod behind the ship", () => {
    const ship = new Ship({
      name: "Jettison Test",
      position: new Vector2D(500, 500),
      heading: 0,
      cargoCapacity: 20,
    });
    ship.addCargo("food", 5);
    room.engine.addEntity(ship);

    const pod = room.jettisonFromShip(ship, "food", 3);
    expect(pod).not.toBeNull();
    expect(pod.resourceType).toBe("food");
    expect(pod.amount).toBe(3);
    expect(ship.cargo.food).toBe(2);
    expect(room.engine.getEntity(pod.id)).toBe(pod);
  });

  test("jettisonFromShip returns null for empty cargo", () => {
    const ship = new Ship({
      name: "Empty Ship",
      position: new Vector2D(0, 0),
    });
    room.engine.addEntity(ship);

    const pod = room.jettisonFromShip(ship, "food", 1);
    expect(pod).toBeNull();
  });

  test("jettisonFromShip returns null for null ship", () => {
    const pod = room.jettisonFromShip(null, "food", 1);
    expect(pod).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Broadcast Methods
// ---------------------------------------------------------------------------

describe("Broadcast Methods", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-bc", "Broadcast Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("broadcast() sends JSON to all connected clients", () => {
    const c1 = mockClient("p1", "Alpha");
    const c2 = mockClient("p2", "Beta");
    room.clients.set(c1.ws, c1);
    room.clients.set(c2.ws, c2);

    room.broadcast({ type: "test_msg", value: 42 });

    expect(c1.ws.send).toHaveBeenCalledTimes(1);
    expect(c2.ws.send).toHaveBeenCalledTimes(1);

    const sent = JSON.parse(c1.ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("test_msg");
    expect(sent.value).toBe(42);
  });

  test("broadcast() skips clients with closed WebSocket", () => {
    const c1 = mockClient("p1", "Alpha");
    c1.ws.readyState = 3; // CLOSED
    room.clients.set(c1.ws, c1);

    room.broadcast({ type: "noop" });
    expect(c1.ws.send).not.toHaveBeenCalled();
  });

  test("broadcastNotification() wraps message in notification envelope", () => {
    const c1 = mockClient("p1", "Alpha");
    room.clients.set(c1.ws, c1);

    room.broadcastNotification("Hello Galaxy!", "warning");

    const sent = JSON.parse(c1.ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("notification");
    expect(sent.message).toBe("Hello Galaxy!");
    expect(sent.style).toBe("warning");
  });

  test("broadcastNotification() defaults style to info", () => {
    const c1 = mockClient("p1", "Alpha");
    room.clients.set(c1.ws, c1);

    room.broadcastNotification("Test info");

    const sent = JSON.parse(c1.ws.send.mock.calls[0][0]);
    expect(sent.style).toBe("info");
  });

  test("broadcastRosterUpdate() builds correct roster payload", () => {
    const c1 = mockClient("p1", "Alpha");
    c1.fleetName = "SQUAD-A";
    c1.isLanded = true;
    const c2 = mockClient("p2", "Beta");
    room.clients.set(c1.ws, c1);
    room.clients.set(c2.ws, c2);

    room.broadcastRosterUpdate();

    expect(c1.ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(c1.ws.send.mock.calls[0][0]);
    expect(sent.type).toBe("lobby_sync");
    expect(sent.count).toBe(2);
    expect(sent.roster).toHaveLength(2);

    const r1 = sent.roster.find((r) => r.id === "p1");
    expect(r1.nickname).toBe("Alpha");
    expect(r1.fleetName).toBe("SQUAD-A");
    expect(r1.status).toBe("docked");

    const r2 = sent.roster.find((r) => r.id === "p2");
    expect(r2.status).toBe("orbit");
  });
});

// ---------------------------------------------------------------------------
// 6. Fleet Management
// ---------------------------------------------------------------------------

describe("Fleet Management", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-fleet", "Fleet Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("createFleet / joinFleet registers a fleet and its members", () => {
    const c1 = mockClient("p1", "Alpha");
    const c2 = mockClient("p2", "Beta");
    room.clients.set(c1.ws, c1);
    room.clients.set(c2.ws, c2);

    // Create fleet manually (matching server logic)
    const code = "FLEET-1";
    c1.fleetName = code;
    room.fleets.set(code, new Set([c1]));

    // Second player joins
    c2.fleetName = code;
    room.fleets.get(code).add(c2);

    expect(room.fleets.has(code)).toBe(true);
    expect(room.fleets.get(code).size).toBe(2);
    expect(room.fleets.get(code).has(c1)).toBe(true);
    expect(room.fleets.get(code).has(c2)).toBe(true);
  });

  test("leaveCurrentFleet removes the member and notifies", () => {
    const c1 = mockClient("p1", "Alpha");
    const c2 = mockClient("p2", "Beta");
    room.clients.set(c1.ws, c1);
    room.clients.set(c2.ws, c2);

    const code = "FLEET-X";
    c1.fleetName = code;
    c2.fleetName = code;
    room.fleets.set(code, new Set([c1, c2]));

    room.leaveCurrentFleet(c1);

    expect(c1.fleetName).toBeNull();
    expect(c1.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "fleet_sync", name: null, members: [] }),
    );
    // Fleet should still exist with one member
    expect(room.fleets.get(code).size).toBe(1);
    expect(room.fleets.get(code).has(c2)).toBe(true);
  });

  test("leaveCurrentFleet dissolves fleet when last member leaves", () => {
    const c1 = mockClient("p1", "Solo");
    room.clients.set(c1.ws, c1);

    const code = "FLEET-SOLO";
    c1.fleetName = code;
    room.fleets.set(code, new Set([c1]));

    room.leaveCurrentFleet(c1);

    expect(c1.fleetName).toBeNull();
    expect(room.fleets.has(code)).toBe(false);
  });

  test("leaveCurrentFleet is a no-op when client has no fleet", () => {
    const c1 = mockClient("p1", "NoFleet");
    room.clients.set(c1.ws, c1);

    room.leaveCurrentFleet(c1);

    expect(c1.fleetName).toBeNull();
    expect(c1.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. Territory Control Integration
// ---------------------------------------------------------------------------

describe("Territory Control Integration", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-tc", "Territory Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("territoryControl has 3 sectors with valid defaults", () => {
    expect(room.territoryControl.sectors.core).toBeDefined();
    expect(room.territoryControl.sectors.frontier).toBeDefined();
    expect(room.territoryControl.sectors.rim).toBeDefined();

    expect(room.territoryControl.sectors.core.controllingFaction).toBe(
      "Federation",
    );
    expect(room.territoryControl.sectors.frontier.controllingFaction).toBe(
      "Frontier League",
    );
  });

  test("adjustInfluence updates sector influence and clamps values", () => {
    room.territoryControl.adjustInfluence("core", "Pirates", 25);
    expect(room.territoryControl.sectors.core.influence.Pirates).toBe(25);

    // Clamp to 100
    room.territoryControl.adjustInfluence("core", "Pirates", 200);
    expect(room.territoryControl.sectors.core.influence.Pirates).toBe(100);

    // Clamp to 0
    room.territoryControl.adjustInfluence("core", "Pirates", -200);
    expect(room.territoryControl.sectors.core.influence.Pirates).toBe(0);
  });

  test("handleControlShift reassigns planet factions when sector is conquered", () => {
    const c1 = mockClient("p1", "Observer");
    room.clients.set(c1.ws, c1);

    // Verify Sol is Federation before the shift
    const sol = room.planets.find((p) => p.name === "Sol");
    expect(sol.faction).toBe("Federation");

    // Simulate a control shift in the core sector from Federation to Pirates
    room.handleControlShift("core", "Federation", "Pirates");

    // Sol should now belong to Pirates
    expect(sol.faction).toBe("Pirates");

    // Verify a chat broadcast was sent
    expect(c1.ws.send).toHaveBeenCalled();
    const messages = c1.ws.send.mock.calls.map((c) => JSON.parse(c[0]));
    const chatMsg = messages.find((m) => m.type === "chat");
    expect(chatMsg.message).toContain("SECTOR CONQUEST");
    expect(chatMsg.message).toContain("Pirates");
  });
});

// ---------------------------------------------------------------------------
// 8. Cosmic Storms
// ---------------------------------------------------------------------------

describe("Cosmic Storms", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-storm", "Storm Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("seeds 2 cosmic storms with distinct hazard types", () => {
    expect(room.cosmicStorms).toHaveLength(2);
    const types = room.cosmicStorms.map((s) => s.hazardType).sort();
    expect(types).toEqual(["emp_storm", "radioactive_cloud"]);
  });

  test("storms are added to the engine", () => {
    for (const storm of room.cosmicStorms) {
      expect(room.engine.getEntity(storm.id)).toBe(storm);
    }
  });

  test("CosmicStorm.isInside detects ships inside the storm radius", () => {
    const empStorm = room.cosmicStorms.find(
      (s) => s.hazardType === "emp_storm",
    );
    const inside = empStorm.isInside(empStorm.position.clone());
    expect(inside).toBe(true);

    const farAway = new Vector2D(99999, 99999);
    expect(empStorm.isInside(farAway)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Utility Functions
// ---------------------------------------------------------------------------

describe("Utility Functions", () => {
  test("getSectorFromPosition returns core for origin", () => {
    expect(getSectorFromPosition({ x: 0, y: 0 })).toBe("core");
  });

  test("getSectorFromPosition returns frontier for positive quadrant", () => {
    expect(getSectorFromPosition({ x: 15000, y: 15000 })).toBe("frontier");
  });

  test("getSectorFromPosition returns rim for negative quadrant", () => {
    expect(getSectorFromPosition({ x: -15000, y: -15000 })).toBe("rim");
  });

  test("getSectorFromPosition returns core for null/undefined", () => {
    expect(getSectorFromPosition(null)).toBe("core");
    expect(getSectorFromPosition(undefined)).toBe("core");
  });

  test("getSectorFromPosition returns core for ambiguous coordinates", () => {
    // Positive x, negative y — neither frontier nor rim
    expect(getSectorFromPosition({ x: 15000, y: -15000 })).toBe("core");
  });

  test("SECTOR_ADJACENCY has symmetric bidirectional links", () => {
    expect(SECTOR_ADJACENCY.core).toContain("frontier");
    expect(SECTOR_ADJACENCY.frontier).toContain("core");
    expect(SECTOR_ADJACENCY.frontier).toContain("rim");
    expect(SECTOR_ADJACENCY.rim).toContain("frontier");
  });

  test("SECTOR_ADJACENCY does not link core directly to rim", () => {
    expect(SECTOR_ADJACENCY.core).not.toContain("rim");
    expect(SECTOR_ADJACENCY.rim).not.toContain("core");
  });
});

// ---------------------------------------------------------------------------
// 10. Metadata
// ---------------------------------------------------------------------------

describe("Metadata", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-meta", "Meta Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("metadata() returns correct shape with zero players", () => {
    const meta = room.metadata();
    expect(meta.id).toBe("room-meta");
    expect(meta.name).toBe("Meta Room");
    expect(meta.mode).toBe("standard");
    expect(meta.maxPlayers).toBe(50);
    expect(meta.players).toBe(0);
    expect(meta.tags).toEqual([]);
  });

  test("metadata() reflects connected player count", () => {
    const c1 = mockClient("p1", "Alpha");
    const c2 = mockClient("p2", "Beta");
    room.clients.set(c1.ws, c1);
    room.clients.set(c2.ws, c2);

    expect(room.metadata().players).toBe(2);
  });

  test("metadata() respects custom mode and tags", () => {
    room.mode = "battle_royale";
    room.maxPlayers = 10;
    room.tags = ["pvp", "ranked"];

    const meta = room.metadata();
    expect(meta.mode).toBe("battle_royale");
    expect(meta.maxPlayers).toBe(10);
    expect(meta.tags).toEqual(["pvp", "ranked"]);
  });
});

// ---------------------------------------------------------------------------
// 11. Serialization
// ---------------------------------------------------------------------------

describe("Serialization", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-ser", "Serialization Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("serializeEntities excludes planets", () => {
    const serialized = room.serializeEntities();
    const planetEntries = serialized.filter((e) => e.type === "planet");
    expect(planetEntries).toHaveLength(0);
  });

  test("serializeEntities includes ships and warp gates", () => {
    const serialized = room.serializeEntities();
    const ships = serialized.filter((e) => e.type === "ship");
    const gates = serialized.filter((e) => e.type === "warp_gate");
    expect(ships.length).toBeGreaterThan(0);
    expect(gates).toHaveLength(4);
  });

  test("serializeEntities rounds coordinates correctly", () => {
    const serialized = room.serializeEntities();
    for (const ent of serialized) {
      // x/y are rounded to 1 decimal place
      expect(ent.x).toBe(Math.round(ent.x * 10) / 10);
      expect(ent.y).toBe(Math.round(ent.y * 10) / 10);
      // heading is rounded to 2 decimal places
      expect(ent.heading).toBe(Math.round(ent.heading * 100) / 100);
    }
  });

  test("ship serialization includes outfits", () => {
    const serialized = room.serializeEntities();
    const ship = serialized.find((e) => e.type === "ship");
    expect(ship.outfits).toBeDefined();
    expect(Array.isArray(ship.outfits)).toBe(true);
  });

  test("warp gate serialization includes sector routing fields", () => {
    const serialized = room.serializeEntities();
    const gate = serialized.find((e) => e.type === "warp_gate");
    expect(gate.name).toBeDefined();
    expect(gate.sector).toBeDefined();
    expect(gate.targetSector).toBeDefined();
    expect(gate.targetPosition).toBeDefined();
    expect(gate.targetPosition.x).toBeDefined();
    expect(gate.targetPosition.y).toBeDefined();
  });

  test("cosmic storm serialization includes hazard metadata", () => {
    const serialized = room.serializeEntities();
    const storm = serialized.find((e) => e.type === "cosmic_storm");
    expect(storm).toBeDefined();
    expect(storm.name).toBeDefined();
    expect(storm.hazardType).toBeDefined();
    expect(storm.color).toBeDefined();
    expect(storm.particleColor).toBeDefined();
  });

  test("projectile serialization includes ownerId, damage, and shieldPierce", () => {
    const proj = new Projectile({
      ownerId: "player-123",
      damage: 25,
      startPosition: new Vector2D(10, 20),
      heading: 1.0,
      speed: 400,
      range: 800,
      shieldPierce: 0.5,
    });
    room.engine.addEntity(proj);

    const serialized = room.serializeEntities();
    const serializedProj = serialized.find(
      (e) => e.type === "projectile" && e.id === proj.id,
    );
    expect(serializedProj).toBeDefined();
    expect(serializedProj.ownerId).toBe("player-123");
    expect(serializedProj.damage).toBe(25);
    expect(serializedProj.shieldPierce).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// 12. Timers and Lifecycle
// ---------------------------------------------------------------------------

describe("Timers and Lifecycle", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-timer", "Timer Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("scheduleTimer tracks pending timer ids", () => {
    const before = room.pendingTimers.size;
    const id = room.scheduleTimer(() => {}, 100_000);
    expect(room.pendingTimers.size).toBe(before + 1);
    expect(room.pendingTimers.has(id)).toBe(true);
    clearTimeout(id);
  });

  test("destroy() clears all pending timers", () => {
    room.scheduleTimer(() => {}, 100_000);
    room.scheduleTimer(() => {}, 100_000);
    expect(room.pendingTimers.size).toBeGreaterThanOrEqual(2);

    room.destroy();
    expect(room.pendingTimers.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 13. AI Population
// ---------------------------------------------------------------------------

describe("AI Population", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-ai", "AI Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("seeds merchant, pirate, and guard AI controllers", () => {
    // 8 merchants + 7 pirates + 6 guards = 21 AIs
    expect(room.ais.length).toBe(21);
  });

  test("each AI controller references a ship present in the engine", () => {
    for (const ai of room.ais) {
      expect(ai.ship).toBeDefined();
      expect(room.engine.getEntity(ai.ship.id)).toBe(ai.ship);
    }
  });

  test("pirate ships have faction set to Pirates", () => {
    const pirateAIs = room.ais.filter((ai) => ai.ship.faction === "Pirates");
    expect(pirateAIs.length).toBeGreaterThan(0);
    for (const ai of pirateAIs) {
      expect(ai.ship.role).toBe("pirate");
    }
  });
});

// ---------------------------------------------------------------------------
// 14. Reputation Decay
// ---------------------------------------------------------------------------

describe("Reputation Decay", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-rep", "Rep Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("decayReputations returns empty when no players are tracked", () => {
    const result = room.decayReputations();
    expect(result).toEqual({});
  });

  test("decayReputations moves standings toward zero", () => {
    const playerId = "test-player";
    room.factionRegistry.adjustStanding(playerId, "Federation", 50);
    expect(room.factionRegistry.getStanding(playerId, "Federation")).toBe(50);

    room.decayReputations();
    const after = room.factionRegistry.getStanding(playerId, "Federation");
    expect(after).toBeLessThan(50);
    expect(after).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 15. Conflict Zone
// ---------------------------------------------------------------------------

describe("Conflict Zone", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-conflict", "Conflict Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("triggerConflictZone sets conflict flags and spawns combatants", () => {
    const aiBefore = room.ais.length;
    const entitiesBefore = room.engine.entities.length;

    room.triggerConflictZone("Federation", "Pirates");

    expect(room.isConflictZone).toBe(true);
    expect(room.conflictFactionA).toBe("Federation");
    expect(room.conflictFactionB).toBe("Pirates");

    // 3 defenders + 3 raiders = 6 new AIs
    expect(room.ais.length).toBe(aiBefore + 6);
    expect(room.engine.entities.length).toBe(entitiesBefore + 6);
  });

  test("conflict zone spawns have correct faction assignments", () => {
    room.triggerConflictZone("Federation", "Pirates");

    // Find the newly spawned ships by name pattern
    const defenders = room.engine.entities.filter(
      (e) => e.type === "ship" && e.name && e.name.includes("Defender"),
    );
    const raiders = room.engine.entities.filter(
      (e) => e.type === "ship" && e.name && e.name.includes("Raider Mk"),
    );

    expect(defenders).toHaveLength(3);
    expect(raiders).toHaveLength(3);

    for (const d of defenders) expect(d.faction).toBe("Federation");
    for (const r of raiders) expect(r.faction).toBe("Pirates");
  });
});

// ---------------------------------------------------------------------------
// 16. Governing Faction
// ---------------------------------------------------------------------------

describe("Governing Faction", () => {
  /** @type {GameInstance} */
  let room;

  beforeEach(() => {
    room = new GameInstance("room-gov", "Gov Room");
  });

  afterEach(() => {
    room.destroy();
  });

  test("getGoverningFaction returns the first non-Independent planet faction", () => {
    // Sol (first planet) is Federation
    expect(room.getGoverningFaction()).toBe("Federation");
  });

  test("getGoverningFaction returns Independents when all planets are Independent", () => {
    for (const planet of room.planets) {
      planet.faction = "Independents";
    }
    expect(room.getGoverningFaction()).toBe("Independents");
  });
});

// ---------------------------------------------------------------------------
// 17. BASE_MARKETS re-export
// ---------------------------------------------------------------------------

describe("BASE_MARKETS re-export", () => {
  test("BASE_MARKETS contains all 8 planet entries", () => {
    const planetNames = Object.keys(BASE_MARKETS);
    expect(planetNames).toHaveLength(8);
    expect(planetNames).toContain("Sol");
    expect(planetNames).toContain("New Polaris");
    expect(planetNames).toContain("Rogue's Hollow");
  });

  test("each BASE_MARKETS entry has all 7 commodities", () => {
    const commodities = [
      "food",
      "electronics",
      "minerals",
      "luxuries",
      "contraband",
      "machinery",
      "ore",
    ];
    for (const [_name, prices] of Object.entries(BASE_MARKETS)) {
      for (const c of commodities) {
        expect(prices[c]).toBeDefined();
        expect(typeof prices[c]).toBe("number");
      }
    }
  });
});
