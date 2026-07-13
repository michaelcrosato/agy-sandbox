import { describe, test, expect, beforeEach, vi } from "vitest";
import { registerMissionSpawnHandlers } from "./missionSpawnHandlers.js";
import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";
import { AIController } from "../engine/ai/AIController.js";

describe("missionSpawnHandlers", () => {
  let clientObj;
  let room;
  let getRoom;
  let planetA;

  beforeEach(() => {
    planetA = {
      name: "Planet A",
      landingRadius: 100,
      position: new Vector2D(1000, 1000),
    };

    clientObj = {
      id: "player-1",
      roomId: "sol",
      ship: { name: "Flagship" },
      send: vi.fn(),
      missionManager: {
        onStorylineStageAdvanced: null,
        onBountyAccepted: null,
        onEscortAccepted: null,
      },
    };

    room = {
      planets: [planetA],
      engine: {
        addEntity: vi.fn(),
      },
      ais: [],
      factionRegistry: {
        factionPolicy: vi.fn().mockReturnValue("mockFactionPolicy"),
        standingPolicy: vi.fn().mockReturnValue("mockStandingPolicy"),
      },
    };

    getRoom = vi.fn().mockReturnValue(room);
  });

  test("should register all three handlers on missionManager", () => {
    registerMissionSpawnHandlers(clientObj, getRoom);
    expect(typeof clientObj.missionManager.onStorylineStageAdvanced).toBe(
      "function",
    );
    expect(typeof clientObj.missionManager.onBountyAccepted).toBe("function");
    expect(typeof clientObj.missionManager.onEscortAccepted).toBe("function");
  });

  describe("onStorylineStageAdvanced", () => {
    test("should exit early if room or destination planet is missing", () => {
      registerMissionSpawnHandlers(clientObj, getRoom);

      // Room missing case
      getRoom.mockReturnValueOnce(null);
      clientObj.missionManager.onStorylineStageAdvanced({
        destination: "Planet A",
        stage: 2,
        targetName: "Boss",
      });
      expect(room.engine.addEntity).not.toHaveBeenCalled();

      // Planet missing case
      clientObj.missionManager.onStorylineStageAdvanced({
        destination: "Planet B",
        stage: 2,
        targetName: "Boss",
      });
      expect(room.engine.addEntity).not.toHaveBeenCalled();
    });

    test("should spawn bossShip for stage 2 and register AI", () => {
      registerMissionSpawnHandlers(clientObj, getRoom);
      clientObj.missionManager.onStorylineStageAdvanced({
        destination: "Planet A",
        stage: 2,
        targetName: "Boss V2",
      });

      expect(room.engine.addEntity).toHaveBeenCalledWith(expect.any(Ship));
      expect(room.ais).toHaveLength(1);
      expect(room.ais[0]).toBeInstanceOf(AIController);

      const spawnedShip = room.engine.addEntity.mock.calls[0][0];
      expect(spawnedShip.name).toBe("Boss V2");
      expect(spawnedShip.maxShield).toBe(500);

      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "STORY ALERT: Boss V2 spotted in orbit of Planet A!",
        style: "error",
      });
    });

    test("should spawn bossShip for stage 3 with higher stats", () => {
      registerMissionSpawnHandlers(clientObj, getRoom);
      clientObj.missionManager.onStorylineStageAdvanced({
        destination: "Planet A",
        stage: 3,
        targetName: "Ultra Boss",
      });

      expect(room.engine.addEntity).toHaveBeenCalledWith(expect.any(Ship));
      const spawnedShip = room.engine.addEntity.mock.calls[0][0];
      expect(spawnedShip.name).toBe("Ultra Boss");
      expect(spawnedShip.maxShield).toBe(1500);
      expect(spawnedShip.maxArmor).toBe(1000);
    });
  });

  describe("onBountyAccepted", () => {
    test("should spawn bounty bossShip and add AI", () => {
      registerMissionSpawnHandlers(clientObj, getRoom);
      clientObj.missionManager.onBountyAccepted({
        destination: "Planet A",
        targetName: "Wanted Raider",
      });

      expect(room.engine.addEntity).toHaveBeenCalledWith(expect.any(Ship));
      expect(room.ais).toHaveLength(1);
      expect(room.ais[0].role).toBe("pirate");

      const spawnedShip = room.engine.addEntity.mock.calls[0][0];
      expect(spawnedShip.name).toBe("Wanted Raider");
      expect(spawnedShip.maxShield).toBe(700);

      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message:
          "ALERT: Wanted threat Wanted Raider spotted in orbit of Planet A!",
        style: "error",
      });
    });
  });

  describe("onEscortAccepted", () => {
    test("should spawn escort transportShip and follow flagship", () => {
      registerMissionSpawnHandlers(clientObj, getRoom);
      clientObj.missionManager.onEscortAccepted({
        origin: "Planet A",
        faction: "Federation",
      });

      expect(room.engine.addEntity).toHaveBeenCalledWith(expect.any(Ship));
      expect(room.ais).toHaveLength(1);

      const controller = room.ais[0];
      expect(controller.role).toBe("escort");
      expect(controller.flagship).toBe(clientObj.ship);
      expect(controller.escortMode).toBe("follow");

      const spawnedShip = room.engine.addEntity.mock.calls[0][0];
      expect(spawnedShip.name).toBe("Diplomatic Transport");
      expect(spawnedShip.role).toBe("escort");
      expect(spawnedShip.faction).toBe("Federation");

      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message:
          "ESCORT ACTIVE: Keep the Diplomatic Transport safe on the way to destination!",
        style: "success",
      });
    });
  });
});
