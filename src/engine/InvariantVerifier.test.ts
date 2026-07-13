import { describe, test, expect, beforeEach } from "vitest";
import { InvariantVerifier } from "./InvariantVerifier.js";
import { Ship } from "./Ship.js";
import { GameInstance } from "./GameInstance.js";

describe("InvariantVerifier (SPEC-091)", () => {
  let game;
  let ship;

  beforeEach(() => {
    game = new GameInstance("test-sector", "Test Sector");
    ship = new Ship({
      id: "test-ship-1",
      name: "Test ship",
      credits: 5000,
      cargoCapacity: 20,
    });
    game.engine.addEntity(ship);
  });

  test("heals negative or non-finite credits to 0", () => {
    // 1. Negative credits
    ship.credits = -100;
    let healed = InvariantVerifier.verify(game);
    expect(healed).toBe(1);
    expect(ship.credits).toBe(0);

    // 2. NaN credits
    ship.credits = NaN;
    healed = InvariantVerifier.verify(game);
    expect(healed).toBe(1);
    expect(ship.credits).toBe(0);
  });

  test("heals negative cargo and prunes excess cargo deterministically", () => {
    // 1. Negative cargo
    ship.cargo.ore = -5;
    let healed = InvariantVerifier.verify(game);
    expect(healed).toBe(1);
    expect(ship.cargo.ore).toBe(0);

    // 2. Excess cargo
    ship.cargo.ore = 15;
    ship.cargo.refined_goods = 10; // Total 25, capacity 20
    healed = InvariantVerifier.verify(game);
    expect(healed).toBe(1);
    // Deterministic sort: "ore" < "refined_goods"
    // "ore" is 15. "refined_goods" is 10.
    // Excess = 5.
    // "ore" is processed first, reduced from 15 to 10.
    expect(ship.cargo.ore).toBe(10);
    expect(ship.cargo.refined_goods).toBe(10);
  });

  test("heals NaN or infinite position and velocity to 0", () => {
    ship.position.x = NaN;
    ship.velocity.y = Infinity;
    const healed = InvariantVerifier.verify(game);
    expect(healed).toBe(2);
    expect(ship.position.x).toBe(0);
    expect(ship.velocity.y).toBe(0);
  });

  test("heals fittings slot overflows and reverts stats", () => {
    // Max weapons is 2. Let's add 3 weapons: Plasma Cannon, Neutron Blaster, and another Plasma Cannon
    ship.outfits = ["Plasma Cannon", "Neutron Blaster", "Plasma Cannon"];
    // Base damage is 10. Let's add weapon damage manually or verify that verification reduces stats.
    ship.weaponDamage = 10 + 25 + 55 + 25;

    const healed = InvariantVerifier.verify(game);
    expect(healed).toBe(1); // 1 overflow item unequipped
    expect(ship.outfits).toEqual(["Plasma Cannon", "Neutron Blaster"]);
    // Reverted 1 Plasma Cannon (25 damage), so weaponDamage should be 90
    expect(ship.weaponDamage).toBe(90);
  });
});
