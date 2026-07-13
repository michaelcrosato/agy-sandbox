import { describe, test, expect } from "vitest";
import {
  DEFAULT_HYPERDRIVE_OPTIONS,
  canJump,
  consumeJump,
  refuel,
  ramscoopRegen,
  validateWarpJump,
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

  describe("validateWarpJump", () => {
    const pos = (x, y) => ({
      x,
      y,
      distance(o) {
        return Math.hypot(this.x - o.x, this.y - o.y);
      },
    });

    test("succeeds when close and fuel is sufficient", () => {
      const ship = { hyperFuel: 50, position: pos(0, 0) };
      const gate = { type: "warp_gate", position: pos(100, 0) };
      expect(validateWarpJump(ship, gate, 20)).toEqual({ ok: true });
    });

    test("fails when gate is invalid or missing", () => {
      const ship = { hyperFuel: 50, position: pos(0, 0) };
      expect(validateWarpJump(ship, null)).toEqual({
        ok: false,
        reason: "Warp Gate invalid or not found!",
      });
      expect(validateWarpJump(ship, { type: "not_gate" })).toEqual({
        ok: false,
        reason: "Warp Gate invalid or not found!",
      });
    });

    test("fails when too far", () => {
      const ship = { hyperFuel: 50, position: pos(0, 0) };
      const gate = { type: "warp_gate", position: pos(200, 0) };
      expect(validateWarpJump(ship, gate, 20)).toEqual({
        ok: false,
        reason:
          "Too far from stargate to initiate warp jump! Move within 150u.",
      });
    });

    test("fails when fuel is insufficient", () => {
      const ship = { hyperFuel: 10, position: pos(0, 0) };
      const gate = { type: "warp_gate", position: pos(50, 0) };
      expect(validateWarpJump(ship, gate, 20)).toEqual({
        ok: false,
        reason:
          "Insufficient Hyper-Fuel! Requires 20 units. Land on a planet to refuel.",
      });
    });

    test("fails when a hostile interdictor ship is within 300 units", () => {
      const ship = {
        id: "player1",
        role: "merchant",
        hyperFuel: 50,
        position: pos(0, 0),
      };
      const gate = { type: "warp_gate", position: pos(10, 0) };

      const hostileInterdictor = {
        type: "ship",
        role: "pirate",
        position: pos(100, 0), // within 300 units (100)
        hasActiveInterdictor: () => true,
      };

      const entities = [hostileInterdictor];

      const res = validateWarpJump(
        ship,
        gate,
        20,
        null,
        "Independents",
        entities,
      );
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(
        "WARP ENGINE DISRUPTED: Interdiction Gravity Well Active",
      );
    });

    test("succeeds if the interdictor ship is friendly", () => {
      const ship = {
        id: "player1",
        role: "merchant",
        hyperFuel: 50,
        position: pos(0, 0),
      };
      const gate = { type: "warp_gate", position: pos(10, 0) };

      const friendlyInterdictor = {
        type: "ship",
        role: "guard", // not hostile to merchant by default
        position: pos(100, 0),
        hasActiveInterdictor: () => true,
      };

      const entities = [friendlyInterdictor];

      const res = validateWarpJump(
        ship,
        gate,
        20,
        null,
        "Independents",
        entities,
      );
      expect(res.ok).toBe(true);
    });

    test("succeeds if the hostile interdictor ship is too far (e.g. 400u)", () => {
      const ship = {
        id: "player1",
        role: "merchant",
        hyperFuel: 50,
        position: pos(0, 0),
      };
      const gate = { type: "warp_gate", position: pos(10, 0) };

      const hostileInterdictor = {
        type: "ship",
        role: "pirate",
        position: pos(400, 0), // outside 300 units (400)
        hasActiveInterdictor: () => true,
      };

      const entities = [hostileInterdictor];

      const res = validateWarpJump(
        ship,
        gate,
        20,
        null,
        "Independents",
        entities,
      );
      expect(res.ok).toBe(true);
    });
  });

  describe("SPEC-155 Mass-Scaled Stargate Jump Costs", () => {
    test("canJump and consumeJump scale fuel cost based on ship totalMass to hullMass ratio", () => {
      const ship = { hyperFuel: 50, mass: 4000, hullMass: 2000 };
      expect(canJump(ship, 20)).toBe(true);
      expect(canJump(ship, 30)).toBe(false);

      const copy = { ...ship };
      expect(consumeJump(copy, 20)).toBe(true);
      expect(copy.hyperFuel).toBe(10);
    });

    test("validateWarpJump fails with dynamic mass-scaled cost message", () => {
      const pos = (x, y) => ({
        x,
        y,
        distance(o) {
          return Math.hypot(this.x - o.x, this.y - o.y);
        },
      });
      const ship = {
        hyperFuel: 30,
        mass: 4000,
        hullMass: 2000,
        position: pos(0, 0),
      };
      const gate = { type: "warp_gate", position: pos(10, 0) };

      const res = validateWarpJump(ship, gate, 20);
      expect(res.ok).toBe(false);
      expect(res.reason).toContain(
        "Insufficient Hyper-Fuel! Requires 40 units",
      );
    });
  });
});
