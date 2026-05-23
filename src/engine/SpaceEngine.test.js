import { SpaceEngine } from "./SpaceEngine.js";
import { Ship } from "./Ship.js";
import { Projectile } from "./Projectile.js";
import { SpaceEntity } from "./SpaceEntity.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("SpaceEngine entity management", () => {
  test("adds entities and retrieves them by id", () => {
    const engine = new SpaceEngine();
    const a = new SpaceEntity({ id: "a" });
    engine.addEntity(a);
    expect(engine.entities.length).toBe(1);
    expect(engine.getEntity("a")).toBe(a);
  });

  test("ignores a duplicate id on add", () => {
    const engine = new SpaceEngine();
    engine.addEntity(new SpaceEntity({ id: "dup" }));
    engine.addEntity(new SpaceEntity({ id: "dup" }));
    expect(engine.entities.length).toBe(1);
  });

  test("removes entities by id and reports whether anything was removed", () => {
    const engine = new SpaceEngine();
    engine.addEntity(new SpaceEntity({ id: "x" }));
    expect(engine.removeEntity("x")).toBe(true);
    expect(engine.getEntity("x")).toBeUndefined();
    expect(engine.removeEntity("missing")).toBe(false);
  });
});

describe("SpaceEngine.update guards and drag", () => {
  test("is a no-op when dt is non-positive", () => {
    const engine = new SpaceEngine({ globalDrag: 0.1 });
    const ship = new Ship({ id: "s", velocity: new Vector2D(100, 0) });
    engine.addEntity(ship);
    engine.update(0);
    expect(ship.velocity.x).toBe(100);
    expect(ship.position.x).toBe(0);
  });

  test("applies global drag to a moving ship", () => {
    const engine = new SpaceEngine({ globalDrag: 0.1 });
    const ship = new Ship({
      id: "s",
      mass: 1000,
      velocity: new Vector2D(100, 0),
    });
    engine.addEntity(ship);
    engine.update(1);
    // drag force = -0.1 * mass * v => a = -10 => v: 100 - 10 = 90
    expect(ship.velocity.x).toBeCloseTo(90, 6);
  });

  test("does not apply drag to non-ship entities", () => {
    const engine = new SpaceEngine({ globalDrag: 0.1 });
    const rock = new SpaceEntity({
      id: "r",
      type: "generic",
      velocity: new Vector2D(100, 0),
    });
    engine.addEntity(rock);
    engine.update(1);
    expect(rock.velocity.x).toBe(100); // unchanged, drifts freely
  });
});

describe("SpaceEngine.cleanupEntities", () => {
  test("drops expired projectiles", () => {
    const engine = new SpaceEngine();
    const proj = new Projectile({
      ownerId: "s",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
      range: 600, // lifetime 1.2s
    });
    engine.addEntity(proj);
    engine.update(1.3); // exceeds lifetime
    expect(engine.getEntity(proj.id)).toBeUndefined();
  });

  test("drops destroyed ships and fires onEntityDestroyed", () => {
    const engine = new SpaceEngine();
    const destroyed = [];
    engine.onEntityDestroyed = (ent) => destroyed.push(ent);

    const ship = new Ship({ id: "doomed", maxArmor: 100 });
    ship.armor = 0; // isDestroyed === true
    engine.addEntity(ship);
    engine.update(0.5);

    expect(engine.getEntity("doomed")).toBeUndefined();
    expect(destroyed).toContain(ship);
  });

  test("drops zero-mass asteroids and fires onEntityDestroyed", () => {
    const engine = new SpaceEngine();
    const destroyed = [];
    engine.onEntityDestroyed = (ent) => destroyed.push(ent);

    const rock = new SpaceEntity({ id: "rock", type: "gem_asteroid", mass: 0 });
    engine.addEntity(rock);
    engine.update(0.1);

    expect(engine.getEntity("rock")).toBeUndefined();
    expect(destroyed).toContain(rock);
  });
});

describe("SpaceEngine.fireWeapon", () => {
  function armedShip(overrides = {}) {
    const ship = new Ship({ id: "gun", ...overrides });
    ship.energy = 100;
    ship.heat = 0;
    return ship;
  }

  test("spawns a projectile, spends energy, builds heat, and sets cooldown", () => {
    const engine = new SpaceEngine();
    const ship = armedShip();
    engine.addEntity(ship);

    const fired = [];
    engine.onProjectileFired = (proj, src) => fired.push({ proj, src });

    engine.fireWeapon(ship);

    const projectiles = engine.entities.filter((e) => e.type === "projectile");
    expect(projectiles.length).toBe(1);
    expect(projectiles[0].ownerId).toBe("gun");
    expect(ship.energy).toBe(94); // 100 - 6
    expect(ship.heat).toBe(8);
    expect(ship.activeWeaponCooldown).toBe(ship.weaponCooldown);
    expect(fired.length).toBe(1);
    expect(fired[0].src).toBe(ship);
  });

  test("does not fire when disabled", () => {
    const engine = new SpaceEngine();
    const ship = armedShip();
    ship.isDisabled = true;
    engine.addEntity(ship);
    engine.fireWeapon(ship);
    expect(engine.entities.some((e) => e.type === "projectile")).toBe(false);
    expect(ship.energy).toBe(100);
  });

  test("does not fire when overheated", () => {
    const engine = new SpaceEngine();
    const ship = armedShip();
    ship.isOverheated = true;
    engine.addEntity(ship);
    engine.fireWeapon(ship);
    expect(engine.entities.some((e) => e.type === "projectile")).toBe(false);
  });

  test("does not fire on insufficient energy", () => {
    const engine = new SpaceEngine();
    const ship = armedShip();
    ship.energy = 5; // below the 6-unit cost
    engine.addEntity(ship);
    engine.fireWeapon(ship);
    expect(engine.entities.some((e) => e.type === "projectile")).toBe(false);
    expect(ship.energy).toBe(5);
  });

  test("update auto-fires a ship holding fire with no active cooldown", () => {
    const engine = new SpaceEngine();
    const ship = armedShip();
    ship.setControls({ isFiring: true });
    ship.activeWeaponCooldown = 0;
    engine.addEntity(ship);
    engine.update(0.05);
    expect(engine.entities.some((e) => e.type === "projectile")).toBe(true);
  });
});

describe("SpaceEngine projectile collisions", () => {
  test("damages a ship the projectile strikes", () => {
    const engine = new SpaceEngine();
    const ship = new Ship({ id: "victim", position: new Vector2D(0, 0) });
    const proj = new Projectile({
      ownerId: "attacker",
      damage: 40,
      startPosition: new Vector2D(5, 0), // within 15 + 3 radii
      heading: 0,
    });
    engine.addEntity(ship);
    engine.addEntity(proj);

    engine.handleCollisions();

    expect(ship.shield).toBe(160); // 200 - 40
    expect(proj.lifetime).toBe(0); // expired on impact
  });

  test("never damages the firing ship", () => {
    const engine = new SpaceEngine();
    const ship = new Ship({ id: "self", position: new Vector2D(0, 0) });
    const proj = new Projectile({
      ownerId: "self",
      damage: 40,
      startPosition: new Vector2D(5, 0),
      heading: 0,
    });
    engine.addEntity(ship);
    engine.addEntity(proj);

    engine.handleCollisions();

    expect(ship.shield).toBe(200); // untouched
    expect(proj.lifetime).toBeGreaterThan(0);
  });

  test("ignores planets entirely", () => {
    const engine = new SpaceEngine();
    const planet = new SpaceEntity({
      id: "p",
      type: "planet",
      radius: 65,
      position: new Vector2D(0, 0),
    });
    const proj = new Projectile({
      ownerId: "attacker",
      damage: 40,
      startPosition: new Vector2D(10, 0),
      heading: 0,
    });
    engine.addEntity(planet);
    engine.addEntity(proj);

    engine.handleCollisions();
    expect(proj.lifetime).toBeGreaterThan(0); // not consumed by the planet
  });

  test("marks a struck asteroid for deletion", () => {
    const engine = new SpaceEngine();
    const rock = new SpaceEntity({
      id: "rock",
      type: "generic",
      radius: 20,
      position: new Vector2D(0, 0),
    });
    const proj = new Projectile({
      ownerId: "attacker",
      damage: 40,
      startPosition: new Vector2D(5, 0),
      heading: 0,
    });
    engine.addEntity(rock);
    engine.addEntity(proj);

    engine.handleCollisions();
    expect(rock.mass).toBe(0);
    expect(rock.destroyedBy).toBe("attacker");
    expect(proj.lifetime).toBe(0);
  });
});

describe("SpaceEngine physical collisions", () => {
  test("two equal-mass ships rebound off each other", () => {
    const engine = new SpaceEngine({ restitution: 0.4 });
    const a = new Ship({
      id: "A",
      position: new Vector2D(0, 0),
      velocity: new Vector2D(10, 0),
    });
    const b = new Ship({
      id: "B",
      position: new Vector2D(20, 0),
      velocity: new Vector2D(-10, 0),
    });
    engine.addEntity(a);
    engine.addEntity(b);

    engine.handleCollisions();

    // Equal mass, restitution 0.4, head-on: vA -> -4, vB -> +4
    expect(a.velocity.x).toBeCloseTo(-4, 6);
    expect(b.velocity.x).toBeCloseTo(4, 6);
    // De-penetrated apart (overlap 10 split evenly)
    expect(a.position.x).toBeCloseTo(-5, 6);
    expect(b.position.x).toBeCloseTo(25, 6);
  });

  test("a planet acts as immovable infinite mass", () => {
    const engine = new SpaceEngine({ restitution: 0.4 });
    const planet = new SpaceEntity({
      id: "planet",
      type: "planet",
      radius: 65,
      mass: 1000000,
      position: new Vector2D(0, 0),
    });
    const ship = new Ship({
      id: "ship",
      radius: 15,
      position: new Vector2D(70, 0),
      velocity: new Vector2D(-10, 0),
    });
    engine.addEntity(planet);
    engine.addEntity(ship);

    engine.handleCollisions();

    expect(planet.position.x).toBe(0); // immovable
    expect(planet.velocity.x).toBe(0);
    expect(ship.position.x).toBeCloseTo(80, 6); // pushed out of overlap
    expect(ship.velocity.x).toBeCloseTo(4, 6); // bounced back
  });

  test("does not impart impulse when entities are separating", () => {
    const engine = new SpaceEngine({ restitution: 0.4 });
    const a = new Ship({
      id: "A",
      position: new Vector2D(0, 0),
      velocity: new Vector2D(-10, 0),
    });
    const b = new Ship({
      id: "B",
      position: new Vector2D(20, 0),
      velocity: new Vector2D(10, 0),
    });
    engine.addEntity(a);
    engine.addEntity(b);

    engine.handleCollisions();

    // Already moving apart: positions de-penetrate but velocities are unchanged.
    expect(a.velocity.x).toBe(-10);
    expect(b.velocity.x).toBe(10);
  });
});
