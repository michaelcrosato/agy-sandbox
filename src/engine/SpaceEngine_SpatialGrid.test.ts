import { describe, test, expect, beforeEach } from "vitest";
import { SpaceEngine } from "./SpaceEngine.js";
import { SpaceEntity } from "./SpaceEntity.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("SpaceEngine Spatial Grid Broad-Phase Collisions", () => {
  let engine;

  beforeEach(() => {
    // RESTITUTION = 1.0 (perfectly elastic rebound)
    engine = new SpaceEngine({ globalDrag: 0, restitution: 1.0 });
  });

  test("should detect and resolve collisions inside the same cell", () => {
    // Place two entities in the same grid cell [0, 0] (coordinates 0 to 499)
    const ent1 = new SpaceEntity({
      id: "e1",
      position: new Vector2D(100, 100),
      radius: 20,
      mass: 10,
    });
    const ent2 = new SpaceEntity({
      id: "e2",
      position: new Vector2D(130, 100), // overlap by 10 units (radius1+radius2 = 40, distance = 30)
      radius: 20,
      mass: 10,
    });

    engine.addEntity(ent1);
    engine.addEntity(ent2);

    // Run collision step
    engine.handleCollisions();

    // They should have recoiled/de-penetrated
    expect(ent1.position.x).toBeLessThan(100);
    expect(ent2.position.x).toBeGreaterThan(130);
  });

  test("should detect and resolve collisions for entities crossing cell boundaries", () => {
    // Place e1 right at cell edge [0, 0] overlapping into [1, 0] (position 490, radius 20, boundary at 500)
    const ent1 = new SpaceEntity({
      id: "e1",
      position: new Vector2D(490, 100),
      radius: 20,
      mass: 10,
    });
    // Place e2 inside cell [1, 0] (position 510, radius 20)
    const ent2 = new SpaceEntity({
      id: "e2",
      position: new Vector2D(510, 100), // overlaps with e1 across boundary (distance = 20, minDist = 40)
      radius: 20,
      mass: 10,
    });

    engine.addEntity(ent1);
    engine.addEntity(ent2);

    engine.handleCollisions();

    // Boundary collision should be detected and resolved elastic rebound
    expect(ent1.position.x).toBeLessThan(490);
    expect(ent2.position.x).toBeGreaterThan(510);
  });

  test("should avoid double-checking overlapping boundary entities (de-duplication)", () => {
    const ent1 = new SpaceEntity({
      id: "e1",
      position: new Vector2D(495, 100), // overlaps [0,0] and [1,0]
      radius: 20,
      mass: 10,
    });
    const ent2 = new SpaceEntity({
      id: "e2",
      position: new Vector2D(505, 100), // overlaps [0,0] and [1,0]
      radius: 20,
      mass: 10,
    });

    // Mock resolveCollision to trace execution counts
    let checkCount = 0;
    engine.resolveCollision = () => {
      checkCount++;
    };

    engine.addEntity(ent1);
    engine.addEntity(ent2);

    engine.handleCollisions();

    // Check should be processed EXACTLY once, not twice despite overlapping both cells!
    expect(checkCount).toBe(1);
  });

  test("should skip checks for entities completely far away in separate cells", () => {
    const ent1 = new SpaceEntity({
      id: "e1",
      position: new Vector2D(100, 100), // cell [0,0]
      radius: 20,
      mass: 10,
    });
    const ent2 = new SpaceEntity({
      id: "e2",
      position: new Vector2D(2000, 2000), // cell [4,4]
      radius: 20,
      mass: 10,
    });

    let checkCount = 0;
    engine.resolveCollision = () => {
      checkCount++;
    };

    engine.addEntity(ent1);
    engine.addEntity(ent2);

    engine.handleCollisions();

    // Far apart entities should never run narrow-phase check
    expect(checkCount).toBe(0);
  });
});
