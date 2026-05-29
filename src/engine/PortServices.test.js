import {
  DEFAULT_PORT_SERVICE_OPTIONS,
  armorDeficit,
  fuelDeficit,
  repairCost,
  refuelCost,
  applyRepair,
  applyRefuel,
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
});
