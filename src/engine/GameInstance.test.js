import { GameInstance } from "./GameInstance.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";
import { shipBountyValue, combatRating } from "./CombatRating.js";

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

  test("scheduleAIRespawn registers a tracked, cancellable timer", () => {
    const room = new GameInstance("room-timer", "Sector Timer");
    expect(room.pendingTimers.size).toBe(0);

    room.scheduleAIRespawn("Pirate Raider", "pirate");
    expect(room.pendingTimers.size).toBe(1);

    room.destroy();
    expect(room.pendingTimers.size).toBe(0);
  });

  test("Siege Raider is exempt from respawn scheduling", () => {
    const room = new GameInstance("room-siege", "Sector Siege");
    room.scheduleAIRespawn("Siege Raider", "pirate");
    expect(room.pendingTimers.size).toBe(0);
    room.destroy();
  });

  test("destroy() clears all pending timers so they never fire against a dead room", () => {
    const room = new GameInstance("room-destroy", "Sector Destroy");
    room.scheduleAIRespawn("Viper Scout", "pirate");
    room.scheduleAIRespawn("Guard One", "guard");
    expect(room.pendingTimers.size).toBe(2);

    room.destroy();
    expect(room.pendingTimers.size).toBe(0);
  });

  test("records a kill on the attributed killer's ship ledger (EW1)", () => {
    const room = new GameInstance("room-kill", "Sector Kill");

    const killerShip = new Ship({ id: "killer-1", name: "Avenger" });
    const fakeWs = { send: () => {} };
    const killerClient = {
      id: "killer-1",
      nickname: "Tester",
      fleetName: null,
      ship: killerShip,
      ws: fakeWs,
      send: () => {},
      sendStats: () => {},
      missionManager: { checkBountyCompletion: () => null },
    };
    room.clients.set(fakeWs, killerClient);

    const victim = new Ship({
      id: "victim-1",
      name: "Test Drone", // non-pirate name -> takes the generic-kill branch
      maxShield: 200,
      maxArmor: 100,
      weaponDamage: 15,
    });
    victim.role = "pirate"; // valid role for respawn scheduling
    victim.destroyedBy = "killer-1";

    room.handleEntityDestroyed(victim);

    const expectedValue = shipBountyValue(victim); // 875 from these stats
    expect(killerShip.kills).toBe(1);
    expect(killerShip.combatValue).toBe(expectedValue);
    expect(killerShip.combatRating).toBe(combatRating(expectedValue));
    expect(killerShip.combatRating).toBeGreaterThan(0);

    room.destroy();
  });

  test("jettisonFromShip ejects a cargo pod and frees the hold (EW6)", () => {
    const room = new GameInstance("room-jet", "Sector Jettison");
    const ship = new Ship({ id: "jet-1", name: "Hauler" });
    ship.addCargo("minerals", 5);
    const before = room.engine.entities.length;

    const pod = room.jettisonFromShip(ship, "minerals", 2);

    expect(pod).not.toBeNull();
    expect(pod.resourceType).toBe("minerals");
    expect(pod.amount).toBe(2);
    expect(ship.cargo.minerals).toBe(3);
    expect(room.engine.entities.length).toBe(before + 1);
    expect(room.engine.getEntity(pod.id)).toBe(pod);

    // Nothing to jettison -> null, no new entity.
    expect(room.jettisonFromShip(ship, "food", 1)).toBeNull();
    expect(room.engine.entities.length).toBe(before + 1);

    room.destroy();
  });

  test("destroying a gem asteroid spawns luxuries cargo pods (EW9)", () => {
    const room = new GameInstance("room-mine", "Sector Mine");
    const rock = {
      type: "gem_asteroid",
      position: new Vector2D(2000, 2000),
      velocity: new Vector2D(0, 0),
    };
    room.handleEntityDestroyed(rock);

    const luxuriesPods = room.engine.entities.filter(
      (e) => e.type === "cargo_pod" && e.resourceType === "luxuries",
    );
    expect(luxuriesPods.length).toBeGreaterThanOrEqual(2); // gem yields 2-3

    room.destroy();
  });
});
