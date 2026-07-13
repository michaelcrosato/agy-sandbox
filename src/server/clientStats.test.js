import { describe, test, expect, beforeEach, vi } from "vitest";
import { sendClientStats } from "./clientStats.js";

describe("clientStats", () => {
  let clientObj;
  let options;
  let mockStore;
  let mockInstances;
  let mockSquadManager;
  let mockGetClients;
  let mockBuildStatsPayload;

  beforeEach(() => {
    clientObj = {
      id: "player-123",
      nickname: "AlphaCommander",
      roomId: "sector-7",
      send: vi.fn(),
      ship: {
        shield: 180,
        maxShield: 200,
        armor: 90,
        maxArmor: 100,
        position: { x: 42, y: 84 },
        target: { name: "TargetShip" },
      },
    };

    mockStore = {
      save: vi.fn().mockResolvedValue(),
      load: vi.fn(),
    };

    mockInstances = {
      get: vi.fn().mockReturnValue({
        factionRegistry: "mockFactionRegistry",
      }),
    };

    mockSquadManager = {
      getSquadForPlayer: vi.fn().mockReturnValue(null),
    };

    mockGetClients = vi.fn().mockReturnValue([]);

    mockBuildStatsPayload = vi.fn().mockReturnValue({
      type: "stats",
      dummy: true,
    });

    options = {
      storeInstance: mockStore,
      instances: mockInstances,
      squadManager: mockSquadManager,
      getClients: mockGetClients,
      buildStatsPayload: mockBuildStatsPayload,
    };
  });

  test("should save player presence to store if client has ship", async () => {
    await sendClientStats(clientObj, options);

    expect(mockStore.save).toHaveBeenCalledWith("presence:player:player-123", {
      id: "player-123",
      nickname: "AlphaCommander",
      roomId: "sector-7",
      ship: {
        shield: 180,
        maxShield: 200,
        armor: 90,
        maxArmor: 100,
        targetName: "TargetShip",
        position: { x: 42, y: 84 },
      },
    });
  });

  test("should not save player presence if client has no ship", async () => {
    clientObj.ship = null;
    await sendClientStats(clientObj, options);

    expect(mockStore.save).not.toHaveBeenCalled();
  });

  test("should swallow presence save failures and continue", async () => {
    mockStore.save.mockRejectedValueOnce(new Error("Redis disconnect"));

    await sendClientStats(clientObj, options);

    expect(mockStore.save).toHaveBeenCalled();
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "stats",
      dummy: true,
    });
  });

  test("should fetch and load local squad members from connection pool", async () => {
    const squadMateObj = { id: "player-456", nickname: "Wingman" };
    mockSquadManager.getSquadForPlayer.mockReturnValueOnce({
      memberIds: ["player-123", "player-456"],
    });
    mockGetClients.mockReturnValueOnce([squadMateObj]);

    await sendClientStats(clientObj, options);

    expect(mockBuildStatsPayload).toHaveBeenCalledWith(
      clientObj,
      "mockFactionRegistry",
      [squadMateObj],
    );
  });

  test("should load remote squad members from presence store if not found locally", async () => {
    mockSquadManager.getSquadForPlayer.mockReturnValueOnce({
      memberIds: ["player-123", "player-789"],
    });
    // Not found locally
    mockGetClients.mockReturnValueOnce([]);
    // Remote presence exists
    mockStore.load.mockResolvedValueOnce({
      id: "player-789",
      nickname: "RemotePilot",
      ship: {
        shield: 50,
        maxShield: 100,
        armor: 30,
        maxArmor: 50,
        targetName: "Alien",
        position: { x: 10, y: 20 },
      },
    });

    await sendClientStats(clientObj, options);

    expect(mockStore.load).toHaveBeenCalledWith("presence:player:player-789");
    expect(mockBuildStatsPayload).toHaveBeenCalledWith(
      clientObj,
      "mockFactionRegistry",
      [
        {
          id: "player-789",
          nickname: "RemotePilot",
          ship: {
            shield: 50,
            maxShield: 100,
            armor: 30,
            maxArmor: 50,
            target: { name: "Alien" },
            position: { x: 10, y: 20 },
          },
        },
      ],
    );
  });

  test("should handle remote presence load errors gracefully and exclude member", async () => {
    mockSquadManager.getSquadForPlayer.mockReturnValueOnce({
      memberIds: ["player-123", "player-789"],
    });
    mockGetClients.mockReturnValueOnce([]);
    mockStore.load.mockRejectedValueOnce(new Error("Redis timeout"));

    await sendClientStats(clientObj, options);

    expect(mockStore.load).toHaveBeenCalled();
    expect(mockBuildStatsPayload).toHaveBeenCalledWith(
      clientObj,
      "mockFactionRegistry",
      [],
    );
  });
});
