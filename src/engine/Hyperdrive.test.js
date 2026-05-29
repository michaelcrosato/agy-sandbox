import {
  DEFAULT_HYPERDRIVE_OPTIONS,
  canJump,
  consumeJump,
  refuel,
  ramscoopRegen,
} from "./Hyperdrive.js";

describe("Hyperdrive (EW3)", () => {
  test("DEFAULT_HYPERDRIVE_OPTIONS is frozen with the legacy jump cost", () => {
    expect(Object.isFrozen(DEFAULT_HYPERDRIVE_OPTIONS)).toBe(true);
    expect(DEFAULT_HYPERDRIVE_OPTIONS.jumpCost).toBe(20);
  });

  describe("canJump", () => {
    test("true at/over cost, false under", () => {
      expect(canJump({ hyperFuel: 20 })).toBe(true);
      expect(canJump({ hyperFuel: 21 })).toBe(true);
      expect(canJump({ hyperFuel: 19 })).toBe(false);
      expect(canJump({ hyperFuel: 100 }, 50)).toBe(true);
      expect(canJump({ hyperFuel: 40 }, 50)).toBe(false);
    });

    test("false on null ship or non-finite fuel", () => {
      expect(canJump(null)).toBe(false);
      expect(canJump({ hyperFuel: NaN })).toBe(false);
    });
  });

  describe("consumeJump", () => {
    test("deducts exactly and reports success when affordable", () => {
      const ship = { hyperFuel: 100 };
      expect(consumeJump(ship)).toBe(true);
      expect(ship.hyperFuel).toBe(80);
      expect(consumeJump(ship, 30)).toBe(true);
      expect(ship.hyperFuel).toBe(50);
    });

    test("is a no-op and returns false when fuel is insufficient", () => {
      const ship = { hyperFuel: 10 };
      expect(consumeJump(ship)).toBe(false);
      expect(ship.hyperFuel).toBe(10);
    });

    test("clamps the floor at 0 when cost equals fuel exactly", () => {
      const ship = { hyperFuel: 20 };
      expect(consumeJump(ship)).toBe(true);
      expect(ship.hyperFuel).toBe(0);
    });
  });

  describe("refuel", () => {
    test("adds fuel and clamps to maxHyperFuel", () => {
      const ship = { hyperFuel: 30, maxHyperFuel: 100 };
      expect(refuel(ship, 40)).toBe(40);
      expect(ship.hyperFuel).toBe(70);
      expect(refuel(ship, 999)).toBe(30); // only 30 to top off
      expect(ship.hyperFuel).toBe(100);
    });

    test("no-op on non-positive / non-finite units or a full tank", () => {
      const ship = { hyperFuel: 100, maxHyperFuel: 100 };
      expect(refuel(ship, 50)).toBe(0);
      expect(refuel(ship, 0)).toBe(0);
      expect(refuel(ship, -5)).toBe(0);
      expect(refuel(null, 10)).toBe(0);
    });
  });

  describe("ramscoopRegen", () => {
    test("adds rate * dt, clamped to max", () => {
      const ship = { hyperFuel: 90, maxHyperFuel: 100 };
      expect(ramscoopRegen(ship, 1, 4)).toBe(4);
      expect(ship.hyperFuel).toBe(94);
      expect(ramscoopRegen(ship, 10, 4)).toBe(6); // clamps at 100
      expect(ship.hyperFuel).toBe(100);
    });

    test("no-op when rate is non-positive or dt invalid", () => {
      const ship = { hyperFuel: 50, maxHyperFuel: 100 };
      expect(ramscoopRegen(ship, 1, 0)).toBe(0);
      expect(ramscoopRegen(ship, 0, 4)).toBe(0);
      expect(ship.hyperFuel).toBe(50);
    });
  });
});
