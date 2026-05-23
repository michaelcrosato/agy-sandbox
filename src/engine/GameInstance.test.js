import { GameInstance } from "./GameInstance.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("GameInstance Multi-Room Matchmaking & Isolation Mechanics", () => {
  test("Should initialize separate authorative space engines, planets, and AIs", () => {
    const roomA = new GameInstance("room-a", "Sector Alpha");
    const roomB = new GameInstance("room-b", "Sector Beta");

    // Both should seed default planets
    expect(roomA.planets.length).toBe(8);
    expect(roomB.planets.length).toBe(8);

    // Verify Sol planet colors and structures are seeded independently
    const solA = roomA.planets.find((p) => p.name === "Sol");
    const solB = roomB.planets.find((p) => p.name === "Sol");
    expect(solA).toBeDefined();
    expect(solB).toBeDefined();
    expect(solA).not.toBe(solB); // separate instances!
  });

  test("Should verify multi-instance physics isolation", () => {
    const roomA = new GameInstance("room-a", "Sector Alpha");
    const roomB = new GameInstance("room-b", "Sector Beta");

    // Place the probe ships in empty deep space, far from any seeded planets,
    // asteroids, or NPC ships. Seeded content (including a guard/merchant next
    // to Sol at the origin) lives within ~23k units of the sector planets, so
    // 50k+ is collision-free. This keeps the only acting force as global drag,
    // making the drift deterministic instead of depending on random spawns.
    const shipA = new Ship({
      id: "player-a",
      name: "Alpha Starfighter",
      position: new Vector2D(50000, 0),
      velocity: new Vector2D(100, 0),
    });
    roomA.engine.addEntity(shipA);

    // Add a different ship to Room B
    const shipB = new Ship({
      id: "player-b",
      name: "Beta Interceptor",
      position: new Vector2D(60000, 0),
      velocity: new Vector2D(0, 200),
    });
    roomB.engine.addEntity(shipB);

    const startAx = shipA.position.x;

    // Run physics updates on room A only
    roomA.engine.update(1.0); // 1 second update

    // Ship A should have drifted along +X; drag slows it but never deflects it.
    expect(shipA.position.x).toBeGreaterThan(startAx);
    expect(shipA.position.y).toBe(0);

    // Ship B should NOT have changed coordinates since Room B was not updated!
    expect(shipB.position.x).toBe(60000);
    expect(shipB.position.y).toBe(0);

    // Now update Room B
    roomB.engine.update(1.0);
    expect(shipB.position.y).toBeGreaterThan(0);
  });

  test("Should separate fleet structures per room", () => {
    const roomA = new GameInstance("room-a", "Sector Alpha");
    const roomB = new GameInstance("room-b", "Sector Beta");

    const client1 = { id: "p1", nickname: "Valkyrie", fleetName: "SQUAD" };
    const client2 = { id: "p2", nickname: "Orion", fleetName: "SQUAD" };

    // Squad in room A
    roomA.fleets.set("SQUAD", new Set([client1]));
    // Squad in room B
    roomB.fleets.set("SQUAD", new Set([client2]));

    expect(roomA.fleets.get("SQUAD").size).toBe(1);
    expect(roomB.fleets.get("SQUAD").size).toBe(1);
    expect(roomA.fleets.get("SQUAD")).not.toBe(roomB.fleets.get("SQUAD"));
  });

  test("Should remove AI controller when the AI ship is destroyed to prevent memory leaks", () => {
    const room = new GameInstance("room-test", "Sector Test");
    const initialAICount = room.ais.length;
    expect(initialAICount).toBeGreaterThan(0);

    const targetAI = room.ais[0];
    const aiShip = targetAI.ship;

    // Simulate ship destruction
    aiShip.destroyedBy = "test-killer";
    room.handleEntityDestroyed(aiShip);

    expect(room.ais.length).toBe(initialAICount - 1);
    expect(room.ais.includes(targetAI)).toBe(false);
  });
});
