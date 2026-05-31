import { jest } from "@jest/globals";
import { Vector2D } from "../physics/Vector2D.js";
import {
  handleControls,
  handleLand,
  handleLaunch,
} from "./gameplayHandlers.js";

describe("gameplayHandlers", () => {
  let clientObj;
  let room;
  let persistenceManager;

  beforeEach(() => {
    clientObj = {
      id: "p1",
      nickname: "TestPlayer",
      isLanded: false,
      planetLandedOn: null,
      send: jest.fn(),
      sendStats: jest.fn(),
      ship: {
        isDestroyed: false,
        velocity: new Vector2D(5, 5),
        position: new Vector2D(0, 0),
        heading: 0,
        cargo: { contraband: 0 },
        maxHyperFuel: 100,
        hyperFuel: 50,
        outfits: [],
        setControls: jest.fn(),
        clearControls: jest.fn(),
      },
      missionManager: {
        checkArrivalCompletions: jest.fn().mockReturnValue([]),
        availableMissions: {},
        generateWorldMissions: jest.fn().mockReturnValue([]),
        generateMissionsForPlanet: jest.fn(),
      },
    };

    room = {
      id: "room-1",
      planets: [
        {
          name: "Sol Prime",
          faction: "Federation",
          landingRadius: 100,
          position: new Vector2D(100, 100),
          canLand: jest.fn().mockReturnValue(true),
          market: {},
        },
      ],
      fleets: new Map(),
      ships: new Map(),
      factionRegistry: {
        dockingPermitted: jest.fn().mockReturnValue(true),
        getStanding: jest.fn().mockReturnValue(0),
      },
      territoryControl: {
        sectors: [],
        adjustInfluence: jest.fn(),
      },
      engine: {
        addEntity: jest.fn(),
        removeEntity: jest.fn(),
      },
      broadcast: jest.fn(),
      broadcastNotification: jest.fn(),
      broadcastRosterUpdate: jest.fn(),
    };

    persistenceManager = {
      savePlayer: jest.fn(),
    };
  });

  describe("handleControls", () => {
    test("sets controls and heading if ship is active and not landed", () => {
      const msg = {
        type: "controls",
        controls: { thrust: true },
        heading: 1.5,
      };

      handleControls(clientObj, msg);

      expect(clientObj.ship.setControls).toHaveBeenCalledWith(msg.controls);
      expect(clientObj.ship.heading).toBe(1.5);
    });

    test("does nothing if ship is destroyed", () => {
      clientObj.ship.isDestroyed = true;
      handleControls(clientObj, { controls: {}, heading: 1 });
      expect(clientObj.ship.setControls).not.toHaveBeenCalled();
    });

    test("does nothing if player is landed", () => {
      clientObj.isLanded = true;
      handleControls(clientObj, { controls: {}, heading: 1 });
      expect(clientObj.ship.setControls).not.toHaveBeenCalled();
    });
  });

  describe("handleLaunch", () => {
    test("does nothing if not landed", () => {
      clientObj.isLanded = false;
      handleLaunch(clientObj, room);
      expect(room.engine.addEntity).not.toHaveBeenCalled();
    });

    test("restores ship to space near the planet", () => {
      clientObj.isLanded = true;
      clientObj.planetLandedOn = room.planets[0];

      handleLaunch(clientObj, room);

      expect(clientObj.isLanded).toBe(false);
      expect(clientObj.planetLandedOn).toBeNull();
      expect(clientObj.ship.position.x).toBe(100);
      expect(clientObj.ship.position.y).toBe(240); // 100 + landingRadius (100) + 40
      expect(clientObj.ship.velocity.x).toBe(0);
      expect(clientObj.ship.velocity.y).toBe(0);
      expect(clientObj.ship.clearControls).toHaveBeenCalled();
      expect(room.engine.addEntity).toHaveBeenCalledWith(clientObj.ship);
      expect(clientObj.send).toHaveBeenCalledWith({ type: "launched" });
      expect(room.broadcastRosterUpdate).toHaveBeenCalled();
    });
  });

  describe("handleLand", () => {
    test("lands player on matching planet and triggers saves and missions", () => {
      handleLand(clientObj, room, persistenceManager);

      expect(clientObj.isLanded).toBe(true);
      expect(clientObj.planetLandedOn.name).toBe("Sol Prime");
      expect(clientObj.ship.velocity.x).toBe(0);
      expect(clientObj.ship.velocity.y).toBe(0);
      expect(clientObj.ship.hyperFuel).toBe(100); // filled to max
      expect(room.engine.removeEntity).toHaveBeenCalledWith(clientObj.id);
      expect(persistenceManager.savePlayer).toHaveBeenCalledWith(
        clientObj.id,
        clientObj,
        room.id,
      );
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "landed",
          planetName: "Sol Prime",
        }),
      );
      expect(room.broadcastRosterUpdate).toHaveBeenCalled();
    });

    test("does not land if canLand returns false", () => {
      room.planets[0].canLand.mockReturnValue(false);
      handleLand(clientObj, room, persistenceManager);

      expect(clientObj.isLanded).toBe(false);
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          style: "error",
        }),
      );
    });

    test("does not land if docking is not permitted (hostile standing)", () => {
      room.factionRegistry.dockingPermitted.mockReturnValue(false);
      handleLand(clientObj, room, persistenceManager);

      expect(clientObj.isLanded).toBe(false);
      expect(clientObj.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          message: expect.stringContaining("Docking refused"),
          style: "error",
        }),
      );
    });
  });
});
