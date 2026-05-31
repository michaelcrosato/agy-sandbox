import { jest } from "@jest/globals";
import {
  handleMissionAccept,
  handleMissionAbandon,
} from "./spaceportMissionHandlers.js";

describe("spaceportMissionHandlers (SPEC-154)", () => {
  let mockClient;
  let mockPlanet;
  let mockRoom;

  beforeEach(() => {
    mockClient = {
      id: "player-1",
      nickname: "Captain-Test",
      isLanded: true,
      ship: { credits: 1000, outfits: [], cargo: {} },
      missionManager: {
        availableMissions: {},
        activeMissions: [],
        generateWorldMissions: jest
          .fn()
          .mockImplementation((planetName, world) => {
            // Mock generating a dynamic mission if a shortage/surplus mismatch exists
            const list = [
              {
                id: "gen-delivery-Sol-Alpha",
                title: "Relief Run: food to Alpha",
                type: "delivery",
                generated: true,
                reward: 2500,
                cargoItem: "food",
                cargoAmount: 5,
              },
            ];
            mockClient.missionManager.availableMissions[planetName] = list;
            return list;
          }),
        acceptMission(p, mId) {
          const list = this.availableMissions[p] || [];
          const m = list.find((x) => x.id === mId);
          if (m) {
            this.activeMissions.push(m);
            return { success: true, message: "Generative Mission Accepted!" };
          }
          return { success: false, message: "Mission not found!" };
        },
        abandonMission(mId) {
          this.activeMissions = this.activeMissions.filter((x) => x.id !== mId);
        },
      },
      sentNotifications: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        }
      },
      sendStats: jest.fn(),
    };

    mockPlanet = {
      name: "Alpha",
      market: { food: 150 }, // shortage
      faction: "Federation",
    };

    mockRoom = {
      planets: [
        mockPlanet,
        {
          name: "Sol",
          market: { food: 50 }, // surplus source
          faction: "Federation",
        },
      ],
      baseMarkets: {
        Alpha: { food: 100 },
        Sol: { food: 100 },
      },
      ships: new Map([
        ["player-1", { id: "player-1", type: "ship" }],
        [
          "pirate-1",
          {
            id: "pirate-1",
            type: "ship",
            name: "Vile Raider",
            bountyValue: 3000,
            faction: "Pirates",
          },
        ],
      ]),
      factionRegistry: {},
    };
  });

  test("generates and accepts a dynamic surplus/shortage generative mission successfully", () => {
    handleMissionAccept(
      mockClient,
      "Alpha",
      "gen-delivery-Sol-Alpha",
      mockPlanet,
      mockRoom,
    );

    // Verify generateWorldMissions was called with correct environment parameters
    expect(mockClient.missionManager.generateWorldMissions).toHaveBeenCalled();
    const calls = mockClient.missionManager.generateWorldMissions.mock.calls[0];
    expect(calls[0]).toBe("Alpha");

    // Verify planetFactions map was dynamically constructed
    const worldArg = calls[1];
    expect(worldArg.planetFactions).toEqual({
      Alpha: "Federation",
      Sol: "Federation",
    });

    // Verify bounty targets were scanned and extracted
    expect(worldArg.bountyTargets).toEqual([
      {
        id: "pirate-1",
        name: "Vile Raider",
        bountyValue: 3000,
        faction: "Pirates",
      },
    ]);

    // Verify acceptance registered in active missions
    expect(mockClient.missionManager.activeMissions.length).toBe(1);
    expect(mockClient.missionManager.activeMissions[0].id).toBe(
      "gen-delivery-Sol-Alpha",
    );
    expect(mockClient.sendStats).toHaveBeenCalled();
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Generative Mission Accepted!",
      style: "success",
    });
  });

  test("abandons an active mission correctly", () => {
    // Manually accept one first
    mockClient.missionManager.availableMissions["Alpha"] = [
      { id: "gen-delivery-Sol-Alpha", title: "Relief Run" },
    ];
    mockClient.missionManager.acceptMission("Alpha", "gen-delivery-Sol-Alpha");
    expect(mockClient.missionManager.activeMissions.length).toBe(1);

    handleMissionAbandon(mockClient, "gen-delivery-Sol-Alpha");

    expect(mockClient.missionManager.activeMissions.length).toBe(0);
    expect(mockClient.sentNotifications[0]).toEqual({
      type: "notification",
      message: "Abandoned contract: Relief Run",
      style: "info",
    });
    expect(mockClient.sendStats).toHaveBeenCalled();
  });
});
