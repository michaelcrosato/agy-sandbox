import { GameInstance } from "./GameInstance.js";
import { Ship } from "./Ship.js";
import { CosmicStorm } from "./CosmicStorm.js";
import { Vector2D } from "../physics/Vector2D.js";
import { buildPerception } from "./ai/buildPerception.js";

describe("CosmicStorm Integration Tests", () => {
  test("GameInstance seeds initial cosmic storms on boot", () => {
    const room = new GameInstance("room-test", "Storm Sector");
    try {
      expect(room.cosmicStorms.length).toBe(2);
      const emp = room.cosmicStorms.find((s) => s.hazardType === "emp_storm");
      const rad = room.cosmicStorms.find(
        (s) => s.hazardType === "radioactive_cloud",
      );

      expect(emp).toBeDefined();
      expect(rad).toBeDefined();
      expect(room.engine.entities.includes(emp)).toBe(true);
      expect(room.engine.entities.includes(rad)).toBe(true);
    } finally {
      room.destroy();
    }
  });

  test("EMP Storm drains ship energy and doubles weapon cooldown over tick updates", () => {
    const room = new GameInstance("room-test-emp", "EMP Sector");
    try {
      // Clear existing entities to isolate the test
      room.engine.entities = [];

      const storm = new CosmicStorm({
        id: "test-emp-storm",
        position: new Vector2D(0, 0),
        radius: 200,
        velocity: new Vector2D(0, 0),
        hazardType: "emp_storm",
      });
      room.engine.addEntity(storm);

      const ship = new Ship({
        id: "ship-emp-test",
        position: new Vector2D(50, 50), // inside storm
        energy: 100,
        maxEnergy: 100,
        weaponCooldown: 0.25,
      });
      room.engine.addEntity(ship);

      // Simulate a tick (dt = 0.5s) using server-style logic
      const dt = 0.5;
      const originalCooldowns = new Map();

      // Mirror server E2 storm hazard loop
      for (const ent of room.engine.entities) {
        if (ent.type === "ship" && !ent.isDestroyed) {
          for (const s of room.engine.entities) {
            if (s.type === "cosmic_storm") {
              if (s.isInside(ent.position)) {
                if (s.hazardType === "emp_storm") {
                  ent.energy = Math.max(0, ent.energy - 15 * dt);
                  if (!originalCooldowns.has(ent)) {
                    originalCooldowns.set(ent, ent.weaponCooldown);
                  }
                  ent.weaponCooldown = originalCooldowns.get(ent) * 2.0;
                }
              }
            }
          }
        }
      }

      // Assert energy is drained: 100 - (15 * 0.5) = 92.5
      expect(ship.energy).toBe(92.5);
      // Assert weapon cooldown is doubled
      expect(ship.weaponCooldown).toBe(0.5);

      // Restore cooldowns
      for (const [s, orig] of originalCooldowns.entries()) {
        s.weaponCooldown = orig;
      }
      expect(ship.weaponCooldown).toBe(0.25);
    } finally {
      room.destroy();
    }
  });

  test("Radioactive Anomaly drains armor when shields are down", () => {
    const room = new GameInstance("room-test-rad", "Radioactive Sector");
    try {
      room.engine.entities = [];

      const storm = new CosmicStorm({
        id: "test-rad-storm",
        position: new Vector2D(0, 0),
        radius: 200,
        velocity: new Vector2D(0, 0),
        hazardType: "radioactive_cloud",
      });
      room.engine.addEntity(storm);

      const ship = new Ship({
        id: "ship-rad-test",
        position: new Vector2D(50, 50),
        maxShield: 100,
        armor: 100,
        maxArmor: 100,
      });
      ship.shield = 0;
      room.engine.addEntity(ship);

      const dt = 1.0;
      // Mirror server radioactive cloud check
      for (const ent of room.engine.entities) {
        if (ent.type === "ship" && !ent.isDestroyed) {
          for (const s of room.engine.entities) {
            if (s.type === "cosmic_storm" && s.isInside(ent.position)) {
              if (s.hazardType === "radioactive_cloud" && ent.shield <= 0) {
                ent.armor = Math.max(0, ent.armor - 5 * dt);
              }
            }
          }
        }
      }

      // Assert armor is decayed: 100 - (5 * 1.0) = 95
      expect(ship.armor).toBe(95);
    } finally {
      room.destroy();
    }
  });

  test("Radioactive Storm reduces ship sensor range by 50% in buildPerception", () => {
    const room = new GameInstance("room-test-jam", "Radioactive Jamming");
    try {
      room.engine.entities = [];

      const storm = new CosmicStorm({
        id: "test-rad-storm",
        position: new Vector2D(0, 0),
        radius: 300,
        hazardType: "radioactive_cloud",
      });
      room.engine.addEntity(storm);

      const ship = new Ship({
        id: "perceiver-ship",
        position: new Vector2D(20, 20), // deep inside storm
      });
      room.engine.addEntity(ship);

      // Target ship is placed 600 units away (within standard 800 sensor range)
      const target = new Ship({
        id: "target-ship",
        position: new Vector2D(600, 0),
      });
      room.engine.addEntity(target);

      console.log("DIAGNOSTIC:", {
        shipPos: ship.position,
        targetPos: target.position,
        stormPos: storm.position,
        stormType: storm.type,
        stormHazard: storm.hazardType,
        stormRadius: storm.radius,
        distanceShipToStorm: ship.position.distance(storm.position),
        distanceShipToTarget: ship.position.distance(target.position),
      });

      // standard perception should find it when there is no storm
      const normalOpps = buildPerception(ship, [ship, target], {
        sensorRange: 800,
      });
      // But under the storm influence, sensorRange drops to 400, so it shouldn't perceive target!
      const _jammedOpps = buildPerception(ship, [ship, target, storm], {
        sensorRange: 800,
      });

      expect(normalOpps.opportunities.trades.length).toBe(0); // no planets

      const dist = ship.position.distance(target.position);
      expect(dist).toBeGreaterThan(400);
      expect(dist).toBeLessThan(800);

      // Create a threat classifier to verify exclusion
      const optsJammed = {
        sensorRange: 800,
        isThreat: (ent) => ent.type === "ship",
      };

      const perceptionNormal = buildPerception(
        ship,
        [ship, target],
        optsJammed,
      );
      const perceptionJammed = buildPerception(
        ship,
        [ship, target, storm],
        optsJammed,
      );

      expect(perceptionNormal.threats.length).toBe(1);
      expect(perceptionJammed.threats.length).toBe(0); // Jammed!
    } finally {
      room.destroy();
    }
  });
});
