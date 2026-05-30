import {
  DEFAULT_PORT_SERVICE_OPTIONS,
  armorDeficit,
  fuelDeficit,
  repairCost,
  refuelCost,
  applyRepair,
  applyRefuel,
  refineCost,
  applyRefine,
} from "./PortServices.js";

describe("PortServices (EW5)", () => {
  test("DEFAULT_PORT_SERVICE_OPTIONS is frozen", () => {
    expect(Object.isFrozen(DEFAULT_PORT_SERVICE_OPTIONS)).toBe(true);
  });

  describe("deficits", () => {
    test("armor/fuel deficits are the gap to max, never negative", () => {
      expect(armorDeficit({ armor: 40, maxArmor: 100 })).toBe(60);
      expect(armorDeficit({ armor: 100, maxArmor: 100 })).toBe(0);
      expect(armorDeficit({ armor: 150, maxArmor: 100 })).toBe(0);
      expect(fuelDeficit({ hyperFuel: 30, maxHyperFuel: 100 })).toBe(70);
      expect(fuelDeficit(null)).toBe(0);
    });
  });

  describe("cost", () => {
    test("is proportional to the deficit and 0 when full", () => {
      expect(repairCost({ armor: 40, maxArmor: 100 })).toBe(60 * 5);
      expect(repairCost({ armor: 100, maxArmor: 100 })).toBe(0);
      expect(refuelCost({ hyperFuel: 30, maxHyperFuel: 100 })).toBe(70 * 8);
      expect(refuelCost({ hyperFuel: 100, maxHyperFuel: 100 })).toBe(0);
    });

    test("respects pricing overrides", () => {
      expect(
        repairCost({ armor: 90, maxArmor: 100 }, { repairCostPerPoint: 20 }),
      ).toBe(200);
    });
  });

  describe("applyRepair", () => {
    test("fully repairs when affordable, charging the cost", () => {
      const ship = { armor: 40, maxArmor: 100, credits: 1000 };
      const r = applyRepair(ship);
      expect(r).toEqual({ repaired: 60, cost: 300, ok: true });
      expect(ship.armor).toBe(100);
      expect(ship.credits).toBe(700);
    });

    test("never exceeds maxArmor (clamps exactly)", () => {
      const ship = { armor: 99, maxArmor: 100, credits: 1000 };
      applyRepair(ship);
      expect(ship.armor).toBe(100);
    });

    test("insufficient credits is a no-op", () => {
      const ship = { armor: 40, maxArmor: 100, credits: 100 }; // needs 300
      const r = applyRepair(ship);
      expect(r.ok).toBe(false);
      expect(r.repaired).toBe(0);
      expect(ship.armor).toBe(40);
      expect(ship.credits).toBe(100);
    });

    test("no damage is a no-op with zero cost", () => {
      const ship = { armor: 100, maxArmor: 100, credits: 1000 };
      const r = applyRepair(ship);
      expect(r).toEqual({ repaired: 0, cost: 0, ok: false });
      expect(ship.credits).toBe(1000);
    });

    test("null ship is safe", () => {
      expect(applyRepair(null)).toEqual({ repaired: 0, cost: 0, ok: false });
    });
  });

  describe("applyRefuel", () => {
    test("fully refuels when affordable, charging the cost", () => {
      const ship = { hyperFuel: 30, maxHyperFuel: 100, credits: 1000 };
      const r = applyRefuel(ship);
      expect(r).toEqual({ refueled: 70, cost: 560, ok: true });
      expect(ship.hyperFuel).toBe(100);
      expect(ship.credits).toBe(440);
    });

    test("insufficient credits is a no-op", () => {
      const ship = { hyperFuel: 30, maxHyperFuel: 100, credits: 50 }; // needs 560
      const r = applyRefuel(ship);
      expect(r.ok).toBe(false);
      expect(ship.hyperFuel).toBe(30);
      expect(ship.credits).toBe(50);
    });

    test("full tank is a no-op", () => {
      const ship = { hyperFuel: 100, maxHyperFuel: 100, credits: 1000 };
      expect(applyRefuel(ship).ok).toBe(false);
      expect(ship.credits).toBe(1000);
    });
  });

  describe("refinery services", () => {
    test("refineCost calculates correct fees with and without standing modifiers", () => {
      // Base fee = 10 per raw ore, quantity 20 => cost 200
      expect(refineCost(20)).toBe(200);

      // With custom baseFeePerOre = 5
      expect(refineCost(20, { baseFeePerOre: 5 })).toBe(100);

      // With mock FactionRegistry and friendly standing (discount)
      const mockRegistry = {
        priceModifier: (playerId, faction, mode) => 0.8, // 20% discount
      };
      expect(refineCost(20, {}, mockRegistry, "player1", "Federation")).toBe(
        160,
      );
    });

    test("applyRefine refines ore into minerals with 2:1 ratio", () => {
      const ship = {
        credits: 1000,
        cargo: { ore: 20, minerals: 0 },
        cargoCapacity: 100,
        getCargoWeight() {
          return this.cargo.ore + this.cargo.minerals;
        },
        removeCargo(item, amount) {
          if (this.cargo[item] >= amount) {
            this.cargo[item] -= amount;
            return true;
          }
          return false;
        },
        addCargo(item, amount) {
          if (this.getCargoWeight() + amount <= this.cargoCapacity) {
            this.cargo[item] += amount;
            return true;
          }
          return false;
        },
      };
      const planet = {
        services: { refinery: true },
        faction: "Federation",
      };

      const r = applyRefine(ship, planet, 20, {}, null, null, "minerals");
      expect(r).toEqual({
        ok: true,
        reason: "refined",
        refined: 20,
        produced: 10,
        cost: 200,
      });
      expect(ship.credits).toBe(800);
      expect(ship.cargo.ore).toBe(0);
      expect(ship.cargo.minerals).toBe(10);
    });

    test("applyRefine refines ore into machinery with 4:1 ratio", () => {
      const ship = {
        credits: 1000,
        cargo: { ore: 20, machinery: 0 },
        cargoCapacity: 100,
        getCargoWeight() {
          return this.cargo.ore + this.cargo.machinery;
        },
        removeCargo(item, amount) {
          if (this.cargo[item] >= amount) {
            this.cargo[item] -= amount;
            return true;
          }
          return false;
        },
        addCargo(item, amount) {
          if (this.getCargoWeight() + amount <= this.cargoCapacity) {
            this.cargo[item] += amount;
            return true;
          }
          return false;
        },
      };
      const planet = {
        services: { refinery: true },
        faction: "Federation",
      };

      const r = applyRefine(ship, planet, 20, {}, null, null, "machinery");
      expect(r).toEqual({
        ok: true,
        reason: "refined",
        refined: 20,
        produced: 5,
        cost: 200,
      });
      expect(ship.credits).toBe(800);
      expect(ship.cargo.ore).toBe(0);
      expect(ship.cargo.machinery).toBe(5);
    });

    test("applyRefine rejects if planet does not offer refinery services", () => {
      const ship = { credits: 1000, cargo: { ore: 20 } };
      const planet = { services: { repair: true } }; // no refinery

      const r = applyRefine(ship, planet, 20);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("no_refinery_services");
    });

    test("applyRefine rejects if quantity is not a multiple of the ratio", () => {
      const ship = { credits: 1000, cargo: { ore: 20 }, cargoCapacity: 100 };
      const planet = { services: { refinery: true } };

      const r = applyRefine(ship, planet, 3, {}, null, null, "minerals"); // ratio 2, 3 is not multiple
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("quantity_must_be_multiple_of_2");
    });

    test("applyRefine rejects if insufficient raw ore", () => {
      const ship = {
        credits: 1000,
        cargo: { ore: 10 },
        cargoCapacity: 100,
        getCargoWeight() {
          return 10;
        },
      };
      const planet = { services: { refinery: true } };

      const r = applyRefine(ship, planet, 20); // needs 20
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("insufficient_ore");
    });

    test("applyRefine rejects if insufficient credits", () => {
      const ship = {
        credits: 50, // needs 200
        cargo: { ore: 20, minerals: 0 },
        cargoCapacity: 100,
        getCargoWeight() {
          return 20;
        },
        removeCargo() {
          return true;
        },
        addCargo() {
          return true;
        },
      };
      const planet = { services: { refinery: true } };

      const r = applyRefine(ship, planet, 20);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("insufficient_credits");
      expect(ship.credits).toBe(50); // unchanged
    });
  });
});
