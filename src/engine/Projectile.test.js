import { describe, test, expect } from "vitest";
import { Projectile } from "./Projectile.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("Projectile construction", () => {
  test("derives launch velocity from heading and speed", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
    });
    expect(p.type).toBe("projectile");
    expect(p.mass).toBe(1);
    expect(p.radius).toBe(3);
    expect(p.velocity.x).toBeCloseTo(500, 6);
    expect(p.velocity.y).toBeCloseTo(0, 6);
  });

  test("adds the owner's velocity to the muzzle velocity", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
      ownerVelocity: new Vector2D(100, 0),
    });
    expect(p.velocity.x).toBeCloseTo(600, 6);
    expect(p.velocity.y).toBeCloseTo(0, 6);
  });

  test("fires along a non-axis heading correctly", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: Math.PI / 2,
      speed: 500,
    });
    expect(p.velocity.x).toBeCloseTo(0, 6);
    expect(p.velocity.y).toBeCloseTo(500, 6);
  });

  test("carries an optional shield-pierce fraction, defaulting to zero", () => {
    const plain = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
    });
    expect(plain.shieldPierce).toBe(0);

    const piercing = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      shieldPierce: 0.5,
    });
    expect(piercing.shieldPierce).toBe(0.5);
  });

  test("computes lifetime as range divided by speed", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
      range: 600,
    });
    expect(p.maxLifetime).toBeCloseTo(1.2, 6);
    expect(p.lifetime).toBeCloseTo(1.2, 6);
  });

  test("applies default damage, speed, and range", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
    });
    expect(p.damage).toBe(15);
    expect(p.velocity.magnitude()).toBeCloseTo(500, 6);
    expect(p.maxLifetime).toBeCloseTo(600 / 500, 6);
  });

  test("retains the owner id for attribution", () => {
    const p = new Projectile({
      ownerId: "killer-42",
      startPosition: new Vector2D(0, 0),
      heading: 0,
    });
    expect(p.ownerId).toBe("killer-42");
  });
});

describe("Projectile.update", () => {
  test("decrements lifetime and advances position by velocity", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
      range: 600,
    });
    p.update(0.5);
    expect(p.lifetime).toBeCloseTo(0.7, 6);
    expect(p.position.x).toBeCloseTo(250, 6);
  });

  test("is a no-op for non-positive dt", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
    });
    const startLifetime = p.lifetime;
    p.update(0);
    expect(p.lifetime).toBe(startLifetime);
    expect(p.position.x).toBe(0);
  });
});

describe("Projectile.isExpired", () => {
  test("is false while lifetime remains", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
      range: 600,
    });
    expect(p.isExpired).toBe(false);
    p.update(1.0);
    expect(p.isExpired).toBe(false);
  });

  test("becomes true once lifetime is exhausted", () => {
    const p = new Projectile({
      ownerId: "ship-1",
      startPosition: new Vector2D(0, 0),
      heading: 0,
      speed: 500,
      range: 600,
    });
    p.update(1.2);
    expect(p.isExpired).toBe(true);
  });
});
