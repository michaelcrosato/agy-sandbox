import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { joinRoom, handleClientDisconnect } from "./connectionLifecycle.js";
import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";

describe("connectionLifecycle", () => {
  let clientObj;
  let ws;
  let options;
  let roomA;
  let roomB;

  beforeEach(() => {
    vi.useFakeTimers();

    clientObj = {
      id: "p1",
      nickname: "Player1",
      roomId: null,
      ws: {},
      send: vi.fn(),
      sendStats: vi.fn(),
    };

    ws = clientObj.ws;

    roomA = {
      id: "room-a",
      name: "Sector A",
      clients: new Map(),
      ais: [],
      engine: {
        entities: [],
        addEntity: vi.fn(),
        removeEntity: vi.fn(),
      },
      planets: [{ name: "PlanetA", market: { ore: 10 } }],
      activeSectorEvent: null,
      leaveCurrentFleet: vi.fn(),
      broadcastNotification: vi.fn(),
      broadcastRosterUpdate: vi.fn(),
    };

    roomB = {
      id: "room-b",
      name: "Sector B",
      clients: new Map(),
      ais: [],
      engine: {
        entities: [],
        addEntity: vi.fn(),
        removeEntity: vi.fn(),
      },
      planets: [{ name: "PlanetB", market: { commodities: 5 } }],
      activeSectorEvent: null,
      leaveCurrentFleet: vi.fn(),
      broadcastNotification: vi.fn(),
      broadcastRosterUpdate: vi.fn(),
    };

    options = {
      instances: new Map([
        ["room-a", roomA],
        ["room-b", roomB],
        ["public", roomA], // fallback
      ]),
      clients: new Map([[ws, clientObj]]),
      persistentSessions: new Map(),
      persistenceManager: {
        savePlayer: vi.fn(),
        loadGalaxy: vi.fn().mockResolvedValue(null),
      },
      galacticChronicle: {},
      WORKERS: 1,
      SHARD_INDEX: 0,
      connectionFloodSentry: {
        deregister: vi.fn(),
      },
      matchmakingQueue: {
        remove: vi.fn(),
        waiting: [],
      },
      loadRegistry: vi.fn(),
      saveRegistry: vi.fn(),
      routeConnection: vi.fn(),
      processMatchmakingQueueForRoom: vi.fn(),
      broadcastLobbySync: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("joinRoom", () => {
    test("successfully joins a room and spawns a ship", async () => {
      await joinRoom(clientObj, "room-b", "NewNickname", options);

      expect(clientObj.roomId).toBe("room-b");
      expect(clientObj.nickname).toBe("NewNickname");
      expect(roomB.clients.get(ws)).toBe(clientObj);
      expect(roomB.engine.addEntity).toHaveBeenCalledWith(expect.any(Ship));
      expect(clientObj.ship).toBeInstanceOf(Ship);

      // Check messages sent to client
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "init",
          playerId: "p1",
          roomId: "room-b",
        }),
      );
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "market_bulk_sync",
          markets: { PlanetB: { commodities: 5 } },
        }),
      );
      expect(roomB.broadcastNotification).toHaveBeenCalledWith(
        "NewNickname entered sector!",
        "info",
      );
      expect(roomB.broadcastRosterUpdate).toHaveBeenCalled();
    });

    test("performs cleanup on previous room when switching", async () => {
      // Setup: client is already in room-a with a ship and an escort AI
      clientObj.roomId = "room-a";
      clientObj.nickname = "Player1";
      const ship = new Ship({ id: "p1", position: new Vector2D(0, 0) });
      clientObj.ship = ship;
      roomA.clients.set(ws, clientObj);
      roomA.engine.entities.push(ship);

      const escortAi = {
        role: "escort",
        flagship: ship,
        ship: { id: "escort-1" },
      };
      roomA.ais.push(escortAi);

      await joinRoom(clientObj, "room-b", "Player1", options);

      // Verify leaveCurrentFleet and escort cleanup on prevRoom (room-a)
      expect(roomA.leaveCurrentFleet).toHaveBeenCalledWith(clientObj);
      expect(roomA.engine.removeEntity).toHaveBeenCalledWith("escort-1");
      expect(roomA.ais).not.toContain(escortAi);
      expect(roomA.engine.removeEntity).toHaveBeenCalledWith(ship.id);
      expect(roomA.clients.has(ws)).toBe(false);
      expect(roomA.broadcastNotification).toHaveBeenCalledWith(
        "Player1 has left the sector.",
        "info",
      );
      expect(options.processMatchmakingQueueForRoom).toHaveBeenCalledWith(
        roomA,
      );

      // Verify joined room-b
      expect(clientObj.roomId).toBe("room-b");
      expect(roomB.clients.get(ws)).toBe(clientObj);
    });
  });

  describe("handleClientDisconnect", () => {
    test("cleans up matchmaking queue and schedules eviction timeout", () => {
      clientObj.roomId = "room-a";
      clientObj.ip = "127.0.0.1";
      options.matchmakingQueue.waiting = [{ clientObj, criteria: {} }];

      handleClientDisconnect(ws, clientObj, options);

      // Sentry IP deregistration
      expect(options.connectionFloodSentry.deregister).toHaveBeenCalledWith(
        "127.0.0.1",
      );

      // Matchmaking queue removals
      expect(options.matchmakingQueue.remove).toHaveBeenCalledWith(clientObj);
      expect(options.matchmakingQueue.waiting).toHaveLength(0);

      // Active client Map deletion happens immediately
      expect(options.clients.has(ws)).toBe(false);

      // Sector warnings broadcast immediately
      expect(roomA.broadcastNotification).toHaveBeenCalledWith(
        "Player1 neural link disconnected. Standby recovery active...",
        "warning",
      );

      // Verify cleanup timeout is scheduled but not run yet
      expect(clientObj.cleanupTimeout).toBeDefined();
      expect(options.persistenceManager.savePlayer).not.toHaveBeenCalled();

      // Trigger the 30s timeout
      vi.advanceTimersByTime(30000);

      // Post-timeout asserts
      expect(options.persistenceManager.savePlayer).toHaveBeenCalledWith(
        "p1",
        clientObj,
        "room-a",
      );
      expect(roomA.leaveCurrentFleet).toHaveBeenCalledWith(clientObj);
      expect(roomA.clients.has(ws)).toBe(false);
      expect(options.persistentSessions.has("p1")).toBe(false);
      expect(roomA.broadcastNotification).toHaveBeenCalledWith(
        "Player1 has left the sector (neural link lost).",
        "info",
      );
      expect(options.broadcastLobbySync).toHaveBeenCalled();
    });
  });
});
