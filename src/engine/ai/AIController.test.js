import { AIController } from "./AIController.js";
import { Ship } from "../Ship.js";
import { SpaceEntity } from "../SpaceEntity.js";
import { Vector2D } from "../../physics/Vector2D.js";
import { FactionRegistry } from "../FactionRegistry.js";

function shipAt(name, x, y, id) {
  return new Ship({ id: id ?? name, name, position: new Vector2D(x, y) });
}

function factionShipAt(name, faction, x, y, id) {
  return new Ship({
    id: id ?? name,
    name,
    faction,
    position: new Vector2D(x, y),
  });
}

describe("AIController.normalizeAngle", () => {
  const ctrl = new AIController(new Ship(), "merchant");
  test("wraps angles into [-PI, PI)", () => {
    expect(ctrl.normalizeAngle(3 * Math.PI)).toBeCloseTo(-Math.PI, 10);
    expect(ctrl.normalizeAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 10);
    expect(ctrl.normalizeAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10);
    expect(ctrl.normalizeAngle(0)).toBe(0);
  });
});

describe("AIController.steerTowards", () => {
  test("turns right toward a target at +90 degrees", () => {
    const ctrl = new AIController(shipAt("S", 0, 0), "merchant");
    ctrl.steerTowards(new Vector2D(0, 100));
    expect(ctrl.ship.controls.isTurningRight).toBe(true);
    expect(ctrl.ship.controls.isTurningLeft).toBe(false);
  });

  test("turns left toward a target at -90 degrees", () => {
    const ctrl = new AIController(shipAt("S", 0, 0), "merchant");
    ctrl.steerTowards(new Vector2D(0, -100));
    expect(ctrl.ship.controls.isTurningLeft).toBe(true);
    expect(ctrl.ship.controls.isTurningRight).toBe(false);
  });

  test("does not turn when the target is dead ahead", () => {
    const ctrl = new AIController(shipAt("S", 0, 0), "merchant");
    ctrl.steerTowards(new Vector2D(100, 0)); // heading 0 already points +x
    expect(ctrl.ship.controls.isTurningLeft).toBe(false);
    expect(ctrl.ship.controls.isTurningRight).toBe(false);
  });
});

describe("AIController.scanSensors", () => {
  test("pirate targets the nearest non-pirate ship, skipping fellow pirates", () => {
    const ctrl = new AIController(
      shipAt("Pirate Raider", 0, 0, "self"),
      "pirate",
    );
    const otherPirate = shipAt("Pirate Raider", 50, 0, "p2");
    const merchant = shipAt("Atlas Hauler", 100, 0, "m");
    ctrl.scanSensors([ctrl.ship, otherPirate, merchant]);
    expect(ctrl.target).toBe(merchant);
  });

  test("pirate finds nothing when all candidates are out of sensor range", () => {
    const ctrl = new AIController(
      shipAt("Pirate Raider", 0, 0, "self"),
      "pirate",
    );
    const merchant = shipAt("Atlas Hauler", 600, 0, "m");
    ctrl.scanSensors([ctrl.ship, merchant]);
    expect(ctrl.target).toBeNull();
  });

  test("guard targets the nearest pirate and ignores civilians", () => {
    const ctrl = new AIController(
      shipAt("System Guard", 0, 0, "self"),
      "guard",
    );
    const merchant = shipAt("Atlas Hauler", 50, 0, "m");
    const pirate = shipAt("Pirate Raider", 100, 0, "p");
    ctrl.scanSensors([ctrl.ship, merchant, pirate]);
    expect(ctrl.target).toBe(pirate);
  });

  test("ignores non-ship entities entirely", () => {
    const ctrl = new AIController(
      shipAt("System Guard", 0, 0, "self"),
      "guard",
    );
    const rock = new SpaceEntity({
      id: "rock",
      type: "generic",
      position: new Vector2D(30, 0),
    });
    ctrl.scanSensors([ctrl.ship, rock]);
    expect(ctrl.target).toBeNull();
  });

  test("does not crash when a candidate ship has no name", () => {
    const ctrl = new AIController(
      shipAt("System Guard", 0, 0, "self"),
      "guard",
    );
    const nameless = new Ship({ id: "ghost", position: new Vector2D(40, 0) });
    nameless.name = undefined;
    expect(() => ctrl.scanSensors([ctrl.ship, nameless])).not.toThrow();
    expect(ctrl.target).toBeNull(); // nameless ship is never a threat
  });
});

describe("AIController.isPirateShip", () => {
  test("classifies pirate- and raider-named ships as hostile", () => {
    expect(AIController.isPirateShip({ name: "Pirate Raider" })).toBe(true);
    expect(AIController.isPirateShip({ name: "Siege Raider" })).toBe(true);
    expect(AIController.isPirateShip({ name: "Pirate Boss Gallows" })).toBe(
      true,
    );
  });

  test("treats civilians and nameless entities as non-hostile", () => {
    expect(AIController.isPirateShip({ name: "Atlas Hauler" })).toBe(false);
    expect(AIController.isPirateShip({ name: undefined })).toBe(false);
    expect(AIController.isPirateShip({})).toBe(false);
  });

  test("prefers role over name (spec 009 decoupling)", () => {
    // A procedurally-named pirate is still hostile via its role.
    expect(
      AIController.isPirateShip({ role: "pirate", name: "Crimson Talon" }),
    ).toBe(true);
    expect(AIController.isPirateShip({ role: "pirate" })).toBe(true);
    // A roled non-pirate is NOT a pirate even if its name contains "Raider".
    expect(
      AIController.isPirateShip({ role: "merchant", name: "Raider Hauler" }),
    ).toBe(false);
    expect(
      AIController.isPirateShip({ role: "guard", name: "Pirate Hunter" }),
    ).toBe(false);
    // Faction disposition is the factionPolicy's job, NOT this classifier:
    // a Pirates-faction ship with no role and a civilian name is not flagged.
    expect(
      AIController.isPirateShip({ faction: "Pirates", name: "Smuggler" }),
    ).toBe(false);
  });

  test("isPirateShip is null-safe", () => {
    expect(AIController.isPirateShip(null)).toBe(false);
    expect(AIController.isPirateShip(undefined)).toBe(false);
  });
});

describe("AIController.executePirateAI", () => {
  test("fires when aligned and within range, holding thrust when too close", () => {
    const ctrl = new AIController(shipAt("Pirate Raider", 0, 0), "pirate");
    ctrl.target = shipAt("Victim", 100, 0); // dist 100 (<150) -> no thrust, aligned -> fire
    ctrl.executePirateAI(0.1);
    expect(ctrl.ship.controls.isFiring).toBe(true);
    expect(ctrl.ship.controls.isThrusting).toBe(false);
  });

  test("thrusts toward an aligned target that is in range but not too close", () => {
    const ctrl = new AIController(shipAt("Pirate Raider", 0, 0), "pirate");
    ctrl.target = shipAt("Victim", 300, 0); // 150 < 300 < 400
    ctrl.executePirateAI(0.1);
    expect(ctrl.ship.controls.isThrusting).toBe(true);
    expect(ctrl.ship.controls.isFiring).toBe(true);
  });

  test("chases without firing when the target is beyond firing range", () => {
    const ctrl = new AIController(shipAt("Pirate Raider", 0, 0), "pirate");
    ctrl.target = shipAt("Victim", 500, 0); // > 400
    ctrl.executePirateAI(0.1);
    expect(ctrl.ship.controls.isThrusting).toBe(true);
    expect(ctrl.ship.controls.isFiring).toBe(false);
  });

  test("does not fire at a target it is not aligned with", () => {
    const ctrl = new AIController(shipAt("Pirate Raider", 0, 0), "pirate");
    ctrl.target = shipAt("Victim", 0, 100); // 90 deg off heading 0
    ctrl.executePirateAI(0.1);
    expect(ctrl.ship.controls.isFiring).toBe(false);
  });
});

describe("AIController.executeMerchantAI", () => {
  test("thrusts toward a distant destination", () => {
    const ctrl = new AIController(shipAt("Atlas Hauler", 0, 0), "merchant");
    ctrl.destination = new Vector2D(200, 0);
    ctrl.executeMerchantAI(0.1);
    expect(ctrl.ship.controls.isThrusting).toBe(true);
  });

  test("brakes and clears the destination once arrived and slow", () => {
    const ctrl = new AIController(shipAt("Atlas Hauler", 0, 0), "merchant");
    ctrl.ship.velocity = new Vector2D(0, 0);
    ctrl.destination = new Vector2D(50, 0); // within 80
    ctrl.executeMerchantAI(0.1);
    expect(ctrl.ship.controls.isBraking).toBe(true);
    expect(ctrl.ship.controls.isThrusting).toBe(false);
    expect(ctrl.destination).toBeNull();
  });

  test("keeps the destination while still moving fast near arrival", () => {
    const ctrl = new AIController(shipAt("Atlas Hauler", 0, 0), "merchant");
    ctrl.ship.velocity = new Vector2D(10, 0); // speed >= 5
    ctrl.destination = new Vector2D(50, 0);
    ctrl.executeMerchantAI(0.1);
    expect(ctrl.ship.controls.isBraking).toBe(true);
    expect(ctrl.destination).not.toBeNull();
  });
});

describe("AIController faction-aware target selection (P3)", () => {
  const policy = new FactionRegistry().factionPolicy();

  test("guard with a faction engages a hostile-faction ship whose NAME is not a pirate", () => {
    // No legacy pirate-name signal — only the faction relation can justify
    // engagement here.
    const guard = factionShipAt("Federation Patrol", "Federation", 0, 0, "g");
    const ctrl = new AIController(guard, "guard", { factionPolicy: policy });
    const enemyShip = factionShipAt("Smuggler", "Pirates", 100, 0, "s");
    ctrl.scanSensors([ctrl.ship, enemyShip]);
    expect(ctrl.target).toBe(enemyShip);
  });

  test("guard with a faction ignores an ally-faction ship even at close range", () => {
    const guard = factionShipAt("Federation Patrol", "Federation", 0, 0, "g");
    const ctrl = new AIController(guard, "guard", { factionPolicy: policy });
    const ally = factionShipAt(
      "Independent Trader",
      "Independents",
      50,
      0,
      "a",
    );
    ctrl.scanSensors([ctrl.ship, ally]);
    expect(ctrl.target).toBeNull();
  });

  test("guard with a faction ignores a neutral-faction ship", () => {
    const guard = factionShipAt("Federation Patrol", "Federation", 0, 0, "g");
    const ctrl = new AIController(guard, "guard", { factionPolicy: policy });
    const neutral = factionShipAt(
      "League Courier",
      "Frontier League",
      80,
      0,
      "n",
    );
    ctrl.scanSensors([ctrl.ship, neutral]);
    expect(ctrl.target).toBeNull();
  });

  test("guard picks the nearer hostile when multiple hostile-faction ships are in range", () => {
    const guard = factionShipAt("Federation Patrol", "Federation", 0, 0, "g");
    const ctrl = new AIController(guard, "guard", { factionPolicy: policy });
    const far = factionShipAt("Raider A", "Pirates", 300, 0, "f");
    const near = factionShipAt("Raider B", "Pirates", 100, 0, "n");
    ctrl.scanSensors([ctrl.ship, far, near]);
    expect(ctrl.target).toBe(near);
  });

  test("pirate with a faction skips allied- and own-faction ships, targets the rest", () => {
    const pirate = factionShipAt(
      "Pirate Captain",
      "Pirates",
      0,
      0,
      "pirate-self",
    );
    const ctrl = new AIController(pirate, "pirate", { factionPolicy: policy });
    const fellowPirate = factionShipAt(
      "Wealthy Looking Ship",
      "Pirates",
      40,
      0,
      "fellow",
    );
    const enemyTrader = factionShipAt(
      "Federation Hauler",
      "Federation",
      100,
      0,
      "victim",
    );
    ctrl.scanSensors([ctrl.ship, fellowPirate, enemyTrader]);
    expect(ctrl.target).toBe(enemyTrader);
  });

  test("legacy name-based behaviour is preserved when no faction is set on the self ship", () => {
    // Self has no faction → factionPathAvailable is false → falls back to
    // isPirateShip(name) classifier, even though a policy is configured.
    const guard = shipAt("System Guard", 0, 0, "self"); // no faction
    const ctrl = new AIController(guard, "guard", { factionPolicy: policy });
    const civilian = factionShipAt("Atlas Hauler", "Federation", 50, 0, "civ");
    const pirate = shipAt("Pirate Raider", 100, 0, "p");
    ctrl.scanSensors([ctrl.ship, civilian, pirate]);
    expect(ctrl.target).toBe(pirate);
  });

  test("legacy name-based behaviour is preserved when the target lacks a faction", () => {
    const guard = factionShipAt(
      "Federation Patrol",
      "Federation",
      0,
      0,
      "self",
    );
    const ctrl = new AIController(guard, "guard", { factionPolicy: policy });
    // Hostile-named candidate, no faction → legacy classifier picks it up.
    const namelessRaider = shipAt("Pirate Raider", 80, 0, "p");
    ctrl.scanSensors([ctrl.ship, namelessRaider]);
    expect(ctrl.target).toBe(namelessRaider);
  });

  test("with no factionPolicy configured, faction tags are ignored entirely", () => {
    const guard = factionShipAt(
      "Federation Patrol",
      "Federation",
      0,
      0,
      "self",
    );
    const ctrl = new AIController(guard, "guard"); // no policy
    const enemyShip = factionShipAt("Smuggler", "Pirates", 100, 0, "s");
    ctrl.scanSensors([ctrl.ship, enemyShip]);
    // Without a policy, falls back to name-based — "Smuggler" is not pirate-named.
    expect(ctrl.target).toBeNull();
  });

  test("shouldTarget returns false for merchants and escorts regardless of faction", () => {
    const merchant = factionShipAt("Atlas Hauler", "Federation", 0, 0, "self");
    const ctrl = new AIController(merchant, "merchant", {
      factionPolicy: policy,
    });
    const enemy = factionShipAt("Smuggler", "Pirates", 100, 0, "s");
    expect(ctrl.shouldTarget(enemy)).toBe(false);
  });
});

describe("AIController escort behaviour", () => {
  test("wanders when it has no flagship", () => {
    const ctrl = new AIController(shipAt("Escort", 0, 0), "escort");
    expect(() => ctrl.update(0.1, [ctrl.ship])).not.toThrow();
  });

  test("brakes to a hold when commanded and moving", () => {
    const ctrl = new AIController(shipAt("Escort", 0, 0), "escort");
    ctrl.flagship = shipAt("Flagship", 0, 0);
    ctrl.escortMode = "hold";
    ctrl.ship.velocity = new Vector2D(10, 0); // speed > 5
    ctrl.executeEscortAI(0.1, []);
    expect(ctrl.ship.controls.isBraking).toBe(true);
  });

  test("in attack mode, scanning hostiles does not crash on nameless entities", () => {
    // Regression: the live entity list contains projectiles/asteroids/pods with
    // no `name`; the attack-mode filter must skip non-ships before reading name.
    const ctrl = new AIController(shipAt("Escort", 0, 0), "escort");
    ctrl.flagship = shipAt("Flagship", 0, 0);
    ctrl.escortMode = "attack";
    ctrl.target = null;
    const projectile = new SpaceEntity({
      id: "proj",
      type: "projectile",
      position: new Vector2D(40, 0),
    });
    const pirate = shipAt("Pirate Raider", 100, 0);
    const entities = [ctrl.ship, ctrl.flagship, projectile, pirate];

    expect(() => ctrl.update(0.1, entities)).not.toThrow();
    // With the nearest hostile acquired and aligned dead ahead, it should fire.
    expect(ctrl.ship.controls.isFiring).toBe(true);
  });

  test("attack mode falls back to follow when no hostiles are present", () => {
    const ctrl = new AIController(shipAt("Escort", 0, 0), "escort");
    ctrl.flagship = shipAt("Flagship", 0, 0);
    ctrl.escortMode = "attack";
    ctrl.target = null;
    ctrl.executeEscortAI(0.1, [ctrl.flagship]); // flagship is not a pirate
    expect(ctrl.escortMode).toBe("follow");
  });

  test("in defend mode, closes formation toward a distant flagship", () => {
    const ctrl = new AIController(shipAt("Escort", 0, 0), "escort");
    ctrl.flagship = shipAt("Flagship", 300, 0); // distToFlag 300 > 160
    ctrl.escortMode = "follow";
    ctrl.executeEscortAI(0.1, []); // no threats
    expect(ctrl.ship.controls.isThrusting).toBe(true);
  });

  test("in attack mode, prioritizes and targets the flagship's active combat target", () => {
    const ctrl = new AIController(shipAt("Escort", 0, 0), "escort");
    ctrl.flagship = shipAt("Flagship", 0, 0);
    const mockTarget = shipAt("Hostile Target", 150, 0);
    ctrl.flagship.target = mockTarget; // flagship is locking target
    ctrl.escortMode = "attack";

    const entities = [ctrl.ship, ctrl.flagship, mockTarget];
    ctrl.executeEscortAI(0.1, entities);

    expect(ctrl.target).toBe(mockTarget);
    expect(ctrl.ship.controls.isFiring).toBe(true); // target within firing arc and close
  });
});
