import {
  canBoard,
  plunder,
  boardRepair,
  boardSalvage,
  boardCapture,
  DEFAULT_BOARDING_OPTIONS,
} from "./Boarding.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

function boarderAt(x = 0, y = 0, extra = {}) {
  return new Ship({
    position: new Vector2D(x, y),
    velocity: new Vector2D(0, 0),
    credits: 1000,
    cargoCapacity: 20,
    ...extra,
  });
}

function disabledTargetAt(x = 30, y = 0, extra = {}) {
  const t = new Ship({
    position: new Vector2D(x, y),
    velocity: new Vector2D(0, 0),
    credits: 2000,
    cargoCapacity: 50,
    ...extra,
  });
  t.isDisabled = true;
  return t;
}

describe("Boarding (EW2)", () => {
  test("DEFAULT_BOARDING_OPTIONS is frozen", () => {
    expect(Object.isFrozen(DEFAULT_BOARDING_OPTIONS)).toBe(true);
  });

  describe("canBoard", () => {
    test("true for a disabled target that is near and slow", () => {
      expect(canBoard(boarderAt(), disabledTargetAt())).toBe(true);
    });

    test("false when the target is not disabled", () => {
      const t = disabledTargetAt();
      t.isDisabled = false;
      expect(canBoard(boarderAt(), t)).toBe(false);
    });

    test("false when out of range or moving too fast", () => {
      expect(canBoard(boarderAt(), disabledTargetAt(500, 0))).toBe(false);
      const fast = boarderAt(0, 0, { velocity: new Vector2D(100, 0) });
      expect(canBoard(fast, disabledTargetAt())).toBe(false);
    });

    test("false for null or self", () => {
      const b = boarderAt();
      expect(canBoard(null, disabledTargetAt())).toBe(false);
      expect(canBoard(b, b)).toBe(false);
    });
  });

  describe("plunder", () => {
    test("moves cargo + a credit cut and is idempotent via looted", () => {
      const boarder = boarderAt();
      const target = disabledTargetAt();
      target.addCargo("minerals", 8);
      target.addCargo("food", 4);

      const r = plunder(boarder, target);
      expect(r.ok).toBe(true);
      expect(r.credits).toBe(1000); // floor(2000 * 0.5)
      expect(boarder.credits).toBe(2000); // 1000 + 1000
      expect(target.credits).toBe(1000);
      expect(boarder.cargo.minerals).toBe(8);
      expect(boarder.cargo.food).toBe(4);
      expect(target.cargo.minerals).toBe(0);
      expect(target.looted).toBe(true);

      // Second plunder is a no-op.
      const again = plunder(boarder, target);
      expect(again.ok).toBe(false);
      expect(boarder.credits).toBe(2000);
    });

    test("respects the boarder's free cargo capacity", () => {
      const boarder = boarderAt(0, 0, { cargoCapacity: 10 });
      boarder.addCargo("food", 8); // free = 2
      const target = disabledTargetAt();
      target.addCargo("minerals", 8);

      const r = plunder(boarder, target);
      expect(r.ok).toBe(true);
      expect(boarder.cargo.minerals).toBe(2);
      expect(target.cargo.minerals).toBe(6);
      expect(boarder.getCargoWeight()).toBe(10); // hold full
    });

    test("refuses to plunder a non-disabled target", () => {
      const t = disabledTargetAt();
      t.isDisabled = false;
      const r = plunder(boarderAt(), t);
      expect(r.ok).toBe(false);
    });
  });

  describe("boardRepair", () => {
    test("revives a disabled friendly and grants no loot", () => {
      const boarder = boarderAt();
      const startCredits = boarder.credits;
      const target = disabledTargetAt();
      target.addCargo("minerals", 5);
      target.armor = 30; // disabled standby armor
      target.maxArmor = 100;

      const r = boardRepair(boarder, target);
      expect(r.ok).toBe(true);
      expect(r.repaired).toBe(70);
      expect(target.armor).toBe(100);
      expect(target.isDisabled).toBe(false);
      // No loot taken.
      expect(boarder.credits).toBe(startCredits);
      expect(boarder.cargo.minerals).toBe(0);
      expect(target.cargo.minerals).toBe(5);
    });
  });

  describe("boardSalvage", () => {
    test("salvages a new module from the target when available", () => {
      const boarder = boarderAt(0, 0, { outfits: ["Basic Laser"] });
      const target = disabledTargetAt(30, 0, {
        outfits: ["Basic Laser", "Shield Booster"],
      });

      const r = boardSalvage(boarder, target);
      expect(r.ok).toBe(true);
      expect(r.salvaged).toBe("Shield Booster");
      expect(boarder.outfits).toContain("Shield Booster");
      expect(r.credits).toBe(0);
    });

    test("awards 800 credits scrap reward if target has no new outfits", () => {
      const boarder = boarderAt(0, 0, {
        outfits: ["Basic Laser", "Shield Booster"],
        credits: 100,
      });
      const target = disabledTargetAt(30, 0, { outfits: ["Basic Laser"] });

      const r = boardSalvage(boarder, target);
      expect(r.ok).toBe(true);
      expect(r.salvaged).toBeNull();
      expect(r.credits).toBe(800);
      expect(boarder.credits).toBe(900);
    });
  });

  describe("boardCapture", () => {
    test("revives target by spending 1500 credits", () => {
      const boarder = boarderAt(0, 0, { credits: 2000 });
      const target = disabledTargetAt();
      target.maxArmor = 100;
      target.armor = 30;

      const r = boardCapture(boarder, target, 1500);
      expect(r.ok).toBe(true);
      expect(boarder.credits).toBe(500);
      expect(target.isDisabled).toBe(false);
      expect(target.armor).toBe(40); // floor(100 * 0.4)
      expect(target.shield).toBe(0);
    });

    test("fails if boarder has insufficient credits", () => {
      const boarder = boarderAt(0, 0, { credits: 1000 });
      const target = disabledTargetAt();

      const r = boardCapture(boarder, target, 1500);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("Insufficient credits");
      expect(boarder.credits).toBe(1000);
      expect(target.isDisabled).toBe(true); // untouched
    });
  });
});
