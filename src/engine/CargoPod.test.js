import { CargoPod } from "./CargoPod.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("CargoPod construction", () => {
  test("is a light drifting container with defaults", () => {
    const pod = new CargoPod();
    expect(pod.type).toBe("cargo_pod");
    expect(pod.mass).toBe(50);
    expect(pod.radius).toBe(8);
    expect(pod.resourceType).toBe("minerals");
    expect(pod.amount).toBe(1);
  });

  test("honours resource type, amount, and inherited entity params", () => {
    const pod = new CargoPod({
      resourceType: "luxuries",
      amount: 5,
      position: new Vector2D(10, 20),
      velocity: new Vector2D(1, 2),
    });
    expect(pod.resourceType).toBe("luxuries");
    expect(pod.amount).toBe(5);
    expect(pod.position.x).toBe(10);
    expect(pod.velocity.y).toBe(2);
  });

  test("seeds a bounded random spin and heading", () => {
    for (let i = 0; i < 50; i++) {
      const pod = new CargoPod();
      expect(pod.heading).toBeGreaterThanOrEqual(0);
      expect(pod.heading).toBeLessThan(Math.PI * 2);
      expect(pod.angularVelocity).toBeGreaterThanOrEqual(-0.75);
      expect(pod.angularVelocity).toBeLessThanOrEqual(0.75);
    }
  });

  test("inherits SpaceEntity force accumulation", () => {
    const pod = new CargoPod({ position: new Vector2D(0, 0) });
    pod.applyForce(new Vector2D(100, 0));
    pod.applyForce(new Vector2D(0, -25));
    expect(pod.accumulatorForce.x).toBe(100);
    expect(pod.accumulatorForce.y).toBe(-25);
  });
});
