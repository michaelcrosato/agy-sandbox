import { describe, test, expect } from "vitest";
import { CosmicStorm } from "./CosmicStorm.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("CosmicStorm unit tests", () => {
  test("constructor seeds fields correctly", () => {
    const storm = new CosmicStorm({
      id: "storm-1",
      name: "Solar Flare",
      description: "EMP field",
      position: new Vector2D(100, 200),
      radius: 150,
      velocity: new Vector2D(5, -10),
      hazardType: "emp_storm",
    });

    expect(storm.id).toBe("storm-1");
    expect(storm.name).toBe("Solar Flare");
    expect(storm.position.x).toBe(100);
    expect(storm.position.y).toBe(200);
    expect(storm.radius).toBe(150);
    expect(storm.velocity.x).toBe(5);
    expect(storm.velocity.y).toBe(-10);
    expect(storm.hazardType).toBe("emp_storm");
    expect(storm.type).toBe("cosmic_storm");
  });

  test("update drifts position deterministic by velocity and dt", () => {
    const storm = new CosmicStorm({
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, -5),
    });

    storm.update(2.0);

    expect(storm.position.x).toBe(120);
    expect(storm.position.y).toBe(90);
  });

  test("isInside boundary checks work correctly", () => {
    const storm = new CosmicStorm({
      position: new Vector2D(0, 0),
      radius: 100,
    });

    expect(storm.isInside(new Vector2D(50, 50))).toBe(true);
    expect(storm.isInside(new Vector2D(0, 100))).toBe(true);
    expect(storm.isInside(new Vector2D(71, 71))).toBe(false); // ~100.41 distance, so false
    expect(storm.isInside(new Vector2D(100, 1))).toBe(false);
    expect(storm.isInside(null)).toBe(false);
  });

  test("serialize and fromJSON roundtrips state exactly", () => {
    const storm = new CosmicStorm({
      id: "storm-2",
      name: "Nebula Storm",
      description: "Stealth cloud",
      position: new Vector2D(30, 40),
      radius: 200,
      velocity: new Vector2D(-5, 8),
      hazardType: "radioactive_cloud",
      color: "rgba(0,0,0,0.5)",
      particleColor: "rgba(1,1,1,0.8)",
    });

    const serialized = storm.serialize();
    const restored = CosmicStorm.fromJSON(serialized);

    expect(restored.id).toBe("storm-2");
    expect(restored.name).toBe("Nebula Storm");
    expect(restored.description).toBe("Stealth cloud");
    expect(restored.position.x).toBe(30);
    expect(restored.position.y).toBe(40);
    expect(restored.radius).toBe(200);
    expect(restored.velocity.x).toBe(-5);
    expect(restored.velocity.y).toBe(8);
    expect(restored.hazardType).toBe("radioactive_cloud");
    expect(restored.color).toBe("rgba(0,0,0,0.5)");
    expect(restored.particleColor).toBe("rgba(1,1,1,0.8)");
    expect(restored.type).toBe("cosmic_storm");
  });
});
