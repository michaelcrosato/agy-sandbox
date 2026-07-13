import { describe, test, expect, beforeEach, vi } from "vitest";

// Set up mocks before importing the target processor
const mockUpdateAILogic = vi.fn();
const mockApplyTractorForces = vi.fn();
const mockHandleCargoCollection = vi.fn();
const mockApplyNebulaHazards = vi.fn();
const mockApplyCosmicStormHazards = vi.fn();
const mockApplySolarEmpHazards = vi.fn();

vi.doMock("./physicsTickHandlers.js", () => ({
  updateAILogic: mockUpdateAILogic,
  applyTractorForces: mockApplyTractorForces,
  handleCargoCollection: mockHandleCargoCollection,
  applyNebulaHazards: mockApplyNebulaHazards,
  applyCosmicStormHazards: mockApplyCosmicStormHazards,
  applySolarEmpHazards: mockApplySolarEmpHazards,
}));

const mockBroadcastRoomState = vi.fn();
vi.doMock("./roomBroadcast.js", () => ({
  broadcastRoomState: mockBroadcastRoomState,
}));

const { processPhysicsTickForRoom } = await import("./physicsTickProcessor.js");

describe("physicsTickProcessor", () => {
  let room;
  let options;

  beforeEach(() => {
    vi.clearAllMocks();

    room = {
      planets: [
        {
          name: "Planet A",
          market: { ore: 10 },
          preEventMarket: { ore: 5 },
        },
      ],
      broadcast: vi.fn(),
      broadcastNotification: vi.fn(),
      checkReputationPatrolSpawns: vi.fn(),
      checkEliteHunterSpawns: vi.fn(),
      checkEscortAmbushSpawns: vi.fn(),
      checkContrabandSpaceScans: vi.fn(),
      engine: {
        update: vi.fn(),
        entities: [],
      },
      determinismSentry: {
        audit: vi.fn(),
      },
      spawnNewAsteroid: vi.fn(),
      fleets: new Map([["fleet-1", {}]]),
      broadcastFleetUpdate: vi.fn(),
      galaxyEventsManager: {
        activeEvent: { name: "Economic Shock" },
        tick: vi.fn().mockReturnValue(false),
      },
      clients: new Map([["client-1", { send: vi.fn() }]]),
    };

    options = {
      squadManager: {},
      latencyMonitor: {},
      metrics: {},
      interestEnabled: true,
      interestRadius: 3000,
      binaryProtocol: true,
    };
  });

  test("runs correct sequence of update, hazard, spawning, kinematics, economic, and broadcast steps", () => {
    processPhysicsTickForRoom(room, 0.1, options);

    // AI logic update
    expect(mockUpdateAILogic).toHaveBeenCalledWith(room, 0.1);

    // Hazard triggers
    expect(mockApplySolarEmpHazards).toHaveBeenCalledWith(
      room,
      expect.any(Map),
    );
    expect(mockApplyTractorForces).toHaveBeenCalledWith(room);
    expect(mockHandleCargoCollection).toHaveBeenCalledWith(room);
    expect(mockApplyNebulaHazards).toHaveBeenCalledWith(room, expect.any(Map));
    expect(mockApplyCosmicStormHazards).toHaveBeenCalledWith(
      room,
      0.1,
      expect.any(Map),
    );

    // Patrol and check spawns
    expect(room.checkReputationPatrolSpawns).toHaveBeenCalledWith(0.1);
    expect(room.checkEliteHunterSpawns).toHaveBeenCalledWith(0.1);
    expect(room.checkEscortAmbushSpawns).toHaveBeenCalledWith(0.1);
    expect(room.checkContrabandSpaceScans).toHaveBeenCalledWith(0.1);

    // Engine update and audit
    expect(room.engine.update).toHaveBeenCalledWith(0.1);
    expect(room.determinismSentry.audit).toHaveBeenCalledWith(room);

    // Asteroids replenishment (less than 35)
    expect(room.spawnNewAsteroid).toHaveBeenCalledWith(false);

    // Fleets update
    expect(room.broadcastFleetUpdate).toHaveBeenCalledWith("fleet-1");

    // Galaxy dynamic event tick
    expect(room.galaxyEventsManager.tick).toHaveBeenCalledWith(0.1);

    // State broadcast
    expect(mockBroadcastRoomState).toHaveBeenCalledWith(room, options);
  });

  test("restores prices and broadcasts economic alert when shock event expires", () => {
    room.galaxyEventsManager.tick.mockReturnValue(true); // event expired

    processPhysicsTickForRoom(room, 0.1, options);

    // Planet A price restored from preEventMarket
    expect(room.planets[0].market.ore).toBe(5);
    expect(room.planets[0].preEventMarket).toBeUndefined();

    // Event clear broadcast
    expect(room.broadcast).toHaveBeenCalledWith({
      type: "galaxy_event_announcement",
      event: null,
    });
    expect(room.broadcastNotification).toHaveBeenCalledWith(
      expect.stringContaining("GALAXY SHOCK OVER"),
      "success",
    );

    // Global chat sync
    const targetClient = room.clients.get("client-1");
    expect(targetClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat",
        sender: "SYSTEM-ECONOMY",
      }),
    );
  });

  test("does not spawn new asteroids if count is >= 35", () => {
    // Populate 35 generic entities
    for (let i = 0; i < 35; i++) {
      room.engine.entities.push({ type: "generic" });
    }

    processPhysicsTickForRoom(room, 0.1, options);

    expect(room.spawnNewAsteroid).not.toHaveBeenCalled();
  });
});
