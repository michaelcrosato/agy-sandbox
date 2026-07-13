import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  handleTrade,
  handlePortService,
  handleJettison,
  handleWarpJump,
  handleBoardingAction,
} from "./actionHandlers.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("actionHandlers (SPEC-103)", () => {
  let mockClient;
  let mockRoom;

  beforeEach(() => {
    mockClient = {
      id: "player-1",
      nickname: "SoloWing",
      isLanded: true,
      planetLandedOn: {
        name: "Earth",
        sector: "Sol",
        faction: "Federation",
        services: { repair: true, refuel: true },
        market: { ore: 100, contraband: 300 },
      },
      ship: {
        credits: 5000,
        cargo: { ore: 0, contraband: 0 },
        cargoBaySize: 10,
        hyperFuel: 10,
        maxHyperFuel: 100,
        armor: 50,
        maxArmor: 100,
        position: new Vector2D(0, 0),
        velocity: new Vector2D(0, 0),
        outfits: [],
        addOutfitMass() {},
        addCargo(item, amt) {
          const total =
            Object.values(this.cargo).reduce((a, b) => a + b, 0) || 0;
          if (total + amt > this.cargoBaySize) return false;
          this.cargo[item] = (this.cargo[item] || 0) + amt;
          return true;
        },
        removeCargo(item, amt) {
          if ((this.cargo[item] || 0) < amt) return false;
          this.cargo[item] -= amt;
          return true;
        },
      },
      sentNotifications: [],
      sentMessages: [],
      send(data) {
        if (data.type === "notification") {
          this.sentNotifications.push(data);
        } else {
          this.sentMessages.push(data);
        }
      },
      sendStats() {},
    };

    mockRoom = {
      factionRegistry: {
        adjustStanding: vi.fn(),
        getStanding: vi.fn(() => 0),
        classifyStanding: vi.fn(() => "neutral"),
        priceModifier: vi.fn(() => 1.0),
        getTransactionTaxRate: vi.fn(() => 0.0),
      },
      economyManager: {
        registerBuy: vi.fn(),
        registerSell: vi.fn(),
      },
      territoryControl: {
        adjustInfluence: vi.fn(),
        sectors: {},
      },
      engine: {
        getEntity: vi.fn((id) => {
          if (id === "gate-1") {
            return {
              id: "gate-1",
              type: "warp_gate",
              position: new Vector2D(0, 0),
              targetSector: "Centauri",
              targetPosition: new Vector2D(1000, 1000),
            };
          }
          if (id === "target-disabled") {
            return {
              id: "target-disabled",
              type: "ship",
              isDisabled: true,
              maxArmor: 200,
              armor: 0,
              credits: 1000,
              cargo: { ore: 2 },
              position: new Vector2D(50, 50),
            };
          }
          return null;
        }),
        removeEntity: vi.fn(),
      },
      getGoverningFaction: vi.fn(() => "Federation"),
      broadcast: vi.fn(),
      broadcastRosterUpdate: vi.fn(),
      jettisonFromShip: vi.fn((ship, item, amount) => {
        if (ship.cargo[item] > 0) {
          ship.cargo[item] -= amount;
          return { resourceType: item, amount };
        }
        return null;
      }),
      ais: [],
    };
  });

  describe("handleTrade", () => {
    test("successfully buys an item and registers it in economy manager", () => {
      mockClient.planetLandedOn.market.ore = 100;
      handleTrade(
        mockClient,
        { type: "trade", action: "buy", item: "ore" },
        mockRoom,
      );

      expect(mockClient.ship.credits).toBe(4895);
      expect(mockClient.ship.cargo.ore).toBe(1);
      expect(mockRoom.economyManager.registerBuy).toHaveBeenCalledWith(
        "Earth",
        "ore",
      );
      expect(mockRoom.factionRegistry.adjustStanding).toHaveBeenCalledWith(
        "player-1",
        "Federation",
        0.5,
      );
      expect(mockClient.sentNotifications[0].style).toBe("success");
    });

    test("successfully sells an item and registers it in economy manager", () => {
      mockClient.ship.cargo.ore = 1;
      mockClient.ship.credits = 1000;
      handleTrade(
        mockClient,
        { type: "trade", action: "sell", item: "ore" },
        mockRoom,
      );

      expect(mockClient.ship.credits).toBe(1095);
      expect(mockClient.ship.cargo.ore).toBe(0);
      expect(mockRoom.economyManager.registerSell).toHaveBeenCalledWith(
        "Earth",
        "ore",
      );
    });

    test("applies +50% price premium for selling contraband at a Black Market spaceport", () => {
      mockClient.ship.cargo.contraband = 1;
      mockClient.planetLandedOn.services = { blackMarket: true };

      // base price 300 * 1.5 = 450. Neutral tax is 5%, so 450 * 0.95 = 427.5, rounded to 428.
      handleTrade(
        mockClient,
        { type: "trade", action: "sell", item: "contraband" },
        mockRoom,
      );

      expect(mockClient.ship.credits).toBe(5428);
      expect(mockClient.ship.cargo.contraband).toBe(0);
    });

    test("rejects buy if player has insufficient credits", () => {
      mockClient.ship.credits = 50;
      handleTrade(
        mockClient,
        { type: "trade", action: "buy", item: "ore" },
        mockRoom,
      );

      expect(mockClient.ship.credits).toBe(50);
      expect(mockClient.sentNotifications[0]).toEqual({
        type: "notification",
        message: "Insufficient credits!",
        style: "error",
      });
    });
  });

  describe("handlePortService", () => {
    test("successfully repairs ship armor and charges credits", () => {
      mockClient.ship.armor = 60;
      mockClient.ship.credits = 2000;

      // repair deficit 40 * 5 = 200 credits
      handlePortService(mockClient, {
        type: "port_service",
        service: "repair",
      });

      expect(mockClient.ship.armor).toBe(100);
      expect(mockClient.ship.credits).toBe(1800);
      expect(mockClient.sentNotifications[0].style).toBe("success");
    });

    test("successfully refuels hyperdrive fuel and charges credits", () => {
      mockClient.ship.hyperFuel = 10;
      mockClient.ship.credits = 1000;

      // refuel deficit 90 * 8 = 720 credits
      handlePortService(mockClient, {
        type: "port_service",
        service: "refuel",
      });

      expect(mockClient.ship.hyperFuel).toBe(100);
      expect(mockClient.ship.credits).toBe(280);
      expect(mockClient.sentNotifications[0].style).toBe("success");
    });
  });

  describe("handleJettison", () => {
    test("jettisons cargo successfully", () => {
      mockClient.ship.cargo.ore = 5;

      handleJettison(
        mockClient,
        { type: "jettison", item: "ore", amount: 2 },
        mockRoom,
      );

      expect(mockClient.ship.cargo.ore).toBe(3);
      expect(mockClient.sentNotifications[0]).toEqual({
        type: "notification",
        message: "Jettisoned 2 ton(s) of ore.",
        style: "info",
      });
    });

    test("sends error if there is nothing to jettison", () => {
      mockClient.ship.cargo.ore = 0;

      handleJettison(
        mockClient,
        { type: "jettison", item: "ore", amount: 1 },
        mockRoom,
      );

      expect(mockClient.sentNotifications[0]).toEqual({
        type: "notification",
        message: "Nothing to jettison.",
        style: "error",
      });
    });
  });

  describe("handleWarpJump", () => {
    test("successfully performs a warp jump transition", () => {
      mockClient.ship.hyperFuel = 50;

      handleWarpJump(
        mockClient,
        { type: "warp_jump", gateId: "gate-1" },
        mockRoom,
      );

      expect(mockClient.ship.position.x).toBe(1000);
      expect(mockClient.ship.position.y).toBe(1000);
      expect(mockClient.ship.hyperFuel).toBe(30); // 50 - 20 jump cost
      expect(mockClient.sentMessages[0].type).toBe("warp_success");
    });
  });

  describe("handleBoardingAction", () => {
    test("performs plunder on disabled ship successfully", () => {
      mockClient.ship.position = new Vector2D(0, 0);

      handleBoardingAction(
        mockClient,
        {
          type: "boarding_action",
          targetId: "target-disabled",
          action: "plunder",
        },
        mockRoom,
      );

      expect(mockClient.ship.credits).toBe(5500); // 5000 + 500 plunder (50%)
      expect(mockClient.sentNotifications[0].style).toBe("success");
    });

    test("performs boarding repair successfully", () => {
      mockClient.ship.position = new Vector2D(0, 0);

      handleBoardingAction(
        mockClient,
        {
          type: "boarding_action",
          targetId: "target-disabled",
          action: "repair",
        },
        mockRoom,
      );

      expect(mockClient.sentNotifications[0].style).toBe("success");
    });

    test("captures ship as escort successfully", () => {
      mockClient.ship.position = new Vector2D(0, 0);

      handleBoardingAction(
        mockClient,
        {
          type: "boarding_action",
          targetId: "target-disabled",
          action: "capture",
        },
        mockRoom,
      );

      expect(mockRoom.ais.length).toBe(1);
      expect(mockRoom.ais[0].role).toBe("escort");
      expect(mockRoom.ais[0].flagship).toBe(mockClient.ship);
      expect(mockClient.sentNotifications[0].style).toBe("success");
    });
  });
});
