import { jest } from "@jest/globals";
import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";
import { CargoPod } from "../engine/CargoPod.js";
import { CosmicStorm } from "../engine/CosmicStorm.js";
import {
  updateAILogic,
  applyTractorForces,
  handleCargoCollection,
  applyNebulaHazards,
  applyCosmicStormHazards,
  applySolarEmpHazards,
} from "./physicsTickHandlers.js";

describe("physicsTickHandlers", () => {
  let room;

  beforeEach(() => {
    room = {
      ais: [],
      clients: new Map(),
      engine: {
        entities: [],
        removeEntity: jest.fn(),
        globalDrag: 0.1,
      },
      planets: [],
      broadcastNotification: jest.fn(),
      broadcast: jest.fn(),
      activeSectorEvent: null,
    };
  });

  describe("updateAILogic", () => {
    test("skips updating destroyed AI ships", () => {
      const ai = {
        ship: { isDestroyed: true, id: "ai-1" },
        update: jest.fn(),
      };
      room.ais.push(ai);

      updateAILogic(room, 0.1);

      expect(ai.update).not.toHaveBeenCalled();
    });

    test("refuels active player target on close proximity and self-destructs caravan", () => {
      const playerShip = new Ship({
        id: "player",
        position: new Vector2D(0, 0),
        maxHyperFuel: 100,
      });
      playerShip.hyperFuel = 10;

      const client = {
        id: "player",
        nickname: "PilotOne",
        ship: playerShip,
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      room.clients.set("player", client);

      const aiShip = new Ship({
        id: "caravan-1",
        position: new Vector2D(50, 0),
      });

      const ai = {
        ship: aiShip,
        isRefuelTanker: true,
        refuelTargetId: "player",
        destination: null,
        update: jest.fn(),
      };
      room.ais.push(ai);
      room.engine.entities.push(aiShip, playerShip);

      updateAILogic(room, 0.1);

      expect(playerShip.hyperFuel).toBe(100);
      expect(aiShip.isDestroyed).toBe(true);
      expect(room.engine.removeEntity).toHaveBeenCalledWith("caravan-1");
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          style: "success",
        }),
      );
      expect(room.broadcastNotification).toHaveBeenCalled();
    });

    test("destroys refuel caravan if target client is missing or target ship is destroyed", () => {
      const aiShip = new Ship({
        id: "caravan-1",
        position: new Vector2D(50, 0),
      });

      const ai = {
        ship: aiShip,
        isRefuelTanker: true,
        refuelTargetId: "player-missing",
        destination: null,
        update: jest.fn(),
      };
      room.ais.push(ai);
      room.engine.entities.push(aiShip);

      updateAILogic(room, 0.1);

      expect(aiShip.isDestroyed).toBe(true);
      expect(room.engine.removeEntity).toHaveBeenCalledWith("caravan-1");
    });

    test("routes merchant to next random hub if destination is null", () => {
      const merchantShip = new Ship({
        id: "merchant-1",
        position: new Vector2D(0, 0),
      });
      const planetA = { name: "Planet A", position: new Vector2D(500, 500) };

      const ai = {
        ship: merchantShip,
        role: "merchant",
        destination: null,
        update: jest.fn(),
      };
      room.ais.push(ai);
      room.planets.push(planetA);

      updateAILogic(room, 0.1);

      expect(ai.destination).not.toBeNull();
      expect(ai.destination.x).toBe(500);
      expect(ai.destination.y).toBe(500);
      expect(ai.update).toHaveBeenCalled();
    });
  });

  describe("applyTractorForces", () => {
    test("pulls cargo pods in range toward tractor-fitted ships", () => {
      const ship = new Ship({
        id: "tractor-ship",
        position: new Vector2D(0, 0),
      });
      ship.outfits = ["Tractor Beam Matrix"];

      const pod = new CargoPod({
        id: "pod-1",
        position: new Vector2D(100, 0),
        resourceType: "minerals",
        amount: 5,
      });

      room.engine.entities.push(ship, pod);

      const applyForceSpy = jest.spyOn(pod, "applyForce");

      applyTractorForces(room);

      expect(applyForceSpy).toHaveBeenCalled();
      applyForceSpy.mockRestore();
    });

    test("ignores cargo pods out of tractor beam range", () => {
      const ship = new Ship({
        id: "tractor-ship",
        position: new Vector2D(0, 0),
      });
      ship.outfits = ["Tractor Beam Matrix"];

      const pod = new CargoPod({
        id: "pod-1",
        position: new Vector2D(300, 0),
        resourceType: "minerals",
        amount: 5,
      });

      room.engine.entities.push(ship, pod);

      const applyForceSpy = jest.spyOn(pod, "applyForce");

      applyTractorForces(room);

      expect(applyForceSpy).not.toHaveBeenCalled();
      applyForceSpy.mockRestore();
    });
  });

  describe("handleCargoCollection", () => {
    test("advances tutorial state on collecting training salvage", () => {
      const ship = new Ship({
        id: "player",
        position: new Vector2D(0, 0),
      });

      const client = {
        id: "player",
        ship,
        tutorialStep: "mine_asteroid",
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      room.clients.set("player", client);

      const pod = new CargoPod({
        id: "salvage-1",
        position: new Vector2D(2, 2),
        resourceType: "minerals",
        amount: 1,
      });
      pod.isTrainingSalvage = true;

      room.engine.entities.push(ship, pod);

      handleCargoCollection(room);

      expect(client.tutorialStep).toBe("dock_at_port");
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "tutorial_state",
          step: "dock_at_port",
        }),
      );
      expect(room.engine.removeEntity).toHaveBeenCalledWith(pod);
    });

    test("successfully collects cargo if ship has enough capacity", () => {
      const ship = new Ship({
        id: "player",
        position: new Vector2D(0, 0),
        cargoCapacity: 50,
      });

      const client = {
        id: "player",
        ship,
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      room.clients.set("player", client);

      const pod = new CargoPod({
        id: "pod-1",
        position: new Vector2D(1, 1),
        resourceType: "minerals",
        amount: 10,
      });

      room.engine.entities.push(ship, pod);

      handleCargoCollection(room);

      expect(ship.cargo.minerals).toBe(10);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "cargo_pickup",
          resourceType: "minerals",
          amount: 10,
        }),
      );
      expect(room.engine.removeEntity).toHaveBeenCalledWith(pod);
    });

    test("triggers error message if ship cargo bay is full", () => {
      const ship = new Ship({
        id: "player",
        position: new Vector2D(0, 0),
        cargoCapacity: 5,
      });

      const client = {
        id: "player",
        ship,
        send: jest.fn(),
        sendStats: jest.fn(),
      };
      room.clients.set("player", client);

      const pod = new CargoPod({
        id: "pod-1",
        position: new Vector2D(1, 1),
        resourceType: "minerals",
        amount: 10,
      });

      room.engine.entities.push(ship, pod);

      handleCargoCollection(room);

      expect(ship.cargo.minerals).toBe(0);
      expect(client.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          style: "error",
        }),
      );
      expect(room.engine.removeEntity).not.toHaveBeenCalled();
    });
  });

  describe("applyNebulaHazards", () => {
    test("applies additional drag multiplier inside nebula bounds", () => {
      const ship = new Ship({
        id: "ship-1",
        position: new Vector2D(1000, 300), // Within Crimson Veil Nebula (x: 1000, y: 300, r: 450)
      });
      ship.velocity = new Vector2D(10, 10);
      room.engine.entities.push(ship);

      const applyForceSpy = jest.spyOn(ship, "applyForce");
      const originalRegens = new Map();

      applyNebulaHazards(room, originalRegens);

      expect(applyForceSpy).toHaveBeenCalled();
      applyForceSpy.mockRestore();
    });

    test("halves shield regeneration rate on shield dampening nebula type", () => {
      const ship = new Ship({
        id: "ship-1",
        position: new Vector2D(-1000, -800), // Within Azure Abyss Nebula (x: -1000, y: -800, r: 500)
      });
      ship.shieldRegen = 2.0;
      room.engine.entities.push(ship);

      const originalRegens = new Map();

      applyNebulaHazards(room, originalRegens);

      expect(ship.shieldRegen).toBe(1.0);
      expect(originalRegens.get(ship)).toBe(2.0);
    });
  });

  describe("applyCosmicStormHazards", () => {
    test("drains energy and doubles weapon cooldown inside EMP cloud cosmic storm", () => {
      const ship = new Ship({
        id: "ship-1",
        position: new Vector2D(50, 50),
      });
      ship.energy = 50;
      ship.weaponCooldown = 1.0;

      const storm = new CosmicStorm({
        id: "storm-1",
        position: new Vector2D(50, 50),
        radius: 100,
        hazardType: "emp_storm",
      });

      room.engine.entities.push(ship, storm);

      const originalCooldowns = new Map();

      applyCosmicStormHazards(room, 1.0, originalCooldowns);

      expect(ship.energy).toBe(35); // 50 - 15 * 1.0
      expect(ship.weaponCooldown).toBe(2.0);
      expect(originalCooldowns.get(ship)).toBe(1.0);
    });

    test("decays armor when shield is depleted inside radioactive cloud cosmic storm", () => {
      const ship = new Ship({
        id: "ship-1",
        position: new Vector2D(50, 50),
      });
      ship.shield = 0;
      ship.armor = 80;

      const storm = new CosmicStorm({
        id: "storm-1",
        position: new Vector2D(50, 50),
        radius: 100,
        hazardType: "radioactive_cloud",
      });

      room.engine.entities.push(ship, storm);

      applyCosmicStormHazards(room, 1.0, new Map());

      expect(ship.armor).toBe(75); // 80 - 5 * 1.0
    });
  });

  describe("applySolarEmpHazards", () => {
    test("shuts down shield regeneration of ships near EMP event planet", () => {
      room.activeSectorEvent = {
        type: "emp",
        planetName: "Aurelia",
      };

      const planet = {
        name: "Aurelia",
        position: new Vector2D(100, 100),
      };
      room.planets.push(planet);

      const ship = new Ship({
        id: "ship-1",
        position: new Vector2D(150, 150),
      });
      ship.shieldRegen = 2.0;

      room.engine.entities.push(ship);

      const originalRegens = new Map();

      applySolarEmpHazards(room, originalRegens);

      expect(ship.shieldRegen).toBe(0);
      expect(originalRegens.get(ship)).toBe(2.0);
    });
  });
});
