import { SpaceEntity } from "./SpaceEntity.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("SpaceEntity construction", () => {
  test("applies sensible defaults when no config is provided", () => {
    const e = new SpaceEntity();
    expect(typeof e.id).toBe("string");
    expect(e.id.length).toBeGreaterThan(0);
    expect(e.type).toBe("generic");
    expect(e.position.x).toBe(0);
    expect(e.position.y).toBe(0);
    expect(e.velocity.x).toBe(0);
    expect(e.velocity.y).toBe(0);
    expect(e.mass).toBe(1000);
    expect(e.heading).toBe(0);
    expect(e.angularVelocity).toBe(0);
    expect(e.radius).toBe(10);
    expect(e.accumulatorForce.x).toBe(0);
    expect(e.accumulatorForce.y).toBe(0);
  });

  test("honours provided config values", () => {
    const e = new SpaceEntity({
      id: "rock-1",
      type: "asteroid",
      position: new Vector2D(10, 20),
      velocity: new Vector2D(1, -2),
      mass: 500,
      heading: 1,
      angularVelocity: 0.5,
      radius: 42,
    });
    expect(e.id).toBe("rock-1");
    expect(e.type).toBe("asteroid");
    expect(e.position.x).toBe(10);
    expect(e.position.y).toBe(20);
    expect(e.velocity.x).toBe(1);
    expect(e.velocity.y).toBe(-2);
    expect(e.mass).toBe(500);
    expect(e.heading).toBe(1);
    expect(e.angularVelocity).toBe(0.5);
    expect(e.radius).toBe(42);
  });

  test("clones position and velocity so mutating the source does not leak in", () => {
    const pos = new Vector2D(5, 5);
    const vel = new Vector2D(2, 2);
    const e = new SpaceEntity({ position: pos, velocity: vel });

    pos.x = 999;
    vel.y = 999;

    expect(e.position.x).toBe(5);
    expect(e.velocity.y).toBe(2);
  });

  test("generates distinct ids for separate entities", () => {
    const a = new SpaceEntity();
    const b = new SpaceEntity();
    expect(a.id).not.toBe(b.id);
  });
});

describe("SpaceEntity.applyForce", () => {
  test("accumulates successive forces additively", () => {
    const e = new SpaceEntity();
    e.applyForce(new Vector2D(100, 0));
    e.applyForce(new Vector2D(0, 50));
    e.applyForce(new Vector2D(-25, -10));
    expect(e.accumulatorForce.x).toBe(75);
    expect(e.accumulatorForce.y).toBe(40);
  });
});

describe("SpaceEntity.update integration", () => {
  test("integrates force into velocity and position (F = m*a)", () => {
    const e = new SpaceEntity({ mass: 1000 });
    e.applyForce(new Vector2D(1000, 0)); // a = 1 m/s^2
    e.update(1);
    // v = 0 + 1*1 = 1 ; pos = 0 + 1*1 = 1
    expect(e.velocity.x).toBe(1);
    expect(e.position.x).toBe(1);
  });

  test("resets the force accumulator after each update", () => {
    const e = new SpaceEntity({ mass: 1000 });
    e.applyForce(new Vector2D(1000, 0));
    e.update(1);
    expect(e.accumulatorForce.x).toBe(0);
    expect(e.accumulatorForce.y).toBe(0);

    // With no new force, velocity is unchanged but position keeps drifting.
    e.update(1);
    expect(e.velocity.x).toBe(1);
    expect(e.position.x).toBe(2);
  });

  test("advances heading by angular velocity", () => {
    const e = new SpaceEntity({ angularVelocity: Math.PI / 2 });
    e.update(1);
    expect(e.heading).toBeCloseTo(Math.PI / 2, 10);
  });

  test("is a no-op when dt is zero or negative", () => {
    const e = new SpaceEntity({ velocity: new Vector2D(10, 10) });
    e.applyForce(new Vector2D(1000, 1000));
    e.update(0);
    expect(e.position.x).toBe(0);
    expect(e.position.y).toBe(0);
    e.update(-5);
    expect(e.position.x).toBe(0);
    expect(e.position.y).toBe(0);
    // The pending force survives because no integration occurred.
    expect(e.accumulatorForce.x).toBe(1000);
  });
});

describe("SpaceEntity.normalizeHeading", () => {
  test("wraps headings at or above PI down into [-PI, PI)", () => {
    const e = new SpaceEntity();
    e.heading = 3 * Math.PI; // -> reduces to PI -> wraps to -PI
    e.normalizeHeading();
    expect(e.heading).toBeCloseTo(-Math.PI, 10);
  });

  test("keeps a heading of -PI within range", () => {
    const e = new SpaceEntity();
    e.heading = -3 * Math.PI; // reduces to -PI, which is in range
    e.normalizeHeading();
    expect(e.heading).toBeCloseTo(-Math.PI, 10);
  });

  test("leaves an already-bounded heading untouched", () => {
    const e = new SpaceEntity();
    e.heading = Math.PI / 4;
    e.normalizeHeading();
    expect(e.heading).toBeCloseTo(Math.PI / 4, 10);
  });

  test("reduces a heading above 2*PI into range", () => {
    const e = new SpaceEntity();
    e.heading = (5 * Math.PI) / 2; // 2.5*PI -> 0.5*PI
    e.normalizeHeading();
    expect(e.heading).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe("SpaceEntity.getDirectionVector", () => {
  test("returns east unit vector at heading 0", () => {
    const e = new SpaceEntity({ heading: 0 });
    const dir = e.getDirectionVector();
    expect(dir.x).toBeCloseTo(1, 10);
    expect(dir.y).toBeCloseTo(0, 10);
  });

  test("returns a unit vector pointing along the heading", () => {
    const e = new SpaceEntity({ heading: Math.PI / 2 });
    const dir = e.getDirectionVector();
    expect(dir.x).toBeCloseTo(0, 10);
    expect(dir.y).toBeCloseTo(1, 10);
    expect(dir.magnitude()).toBeCloseTo(1, 10);
  });
});
