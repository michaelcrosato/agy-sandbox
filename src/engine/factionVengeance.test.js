import { GameInstance } from "./GameInstance.js";
import { Ship } from "./Ship.js";
import { Vector2D } from "../physics/Vector2D.js";
import { SandboxSecurityRegistry } from "../net/SandboxSecurityRegistry.js";
import { AIController } from "./ai/AIController.js";

describe("Dynamic Faction Vengeance Spawner & Coordinated AI Wings (SPEC-156)", () => {
  beforeEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  afterEach(() => {
    SandboxSecurityRegistry.clearRegistry();
  });

  test("Sweeps trigger on standing < -50, spawning a full wing of 3 vengeance ships", () => {
    const room = new GameInstance("vengeance-room", "Vengeance Sector");
    try {
      room.chronicle = {
        events: [],
        recordEvent(ev) {
          this.events.push(ev);
        },
      };

      const playerId = "hostile-player";
      const playerShip = new Ship({
        id: playerId,
        name: "Commander Target",
        position: new Vector2D(0, 0),
        maxShield: 100,
        maxArmor: 100,
      });
      room.engine.addEntity(playerShip);

      const client = {
        id: playerId,
        ship: playerShip,
        send: () => {},
        missionManager: {
          checkBountyCompletion: () => null,
        },
        ws: { readyState: 1, send: () => {} },
      };
      room.clients.set(playerId, client);

      // Set standing to -55 (hostile, < -50)
      room.factionRegistry.adjustStanding(playerId, "Federation", -55);

      // Run spawner sweep
      room.checkEliteHunterSpawns(15);

      // Verify 3 vengeance ships have been spawned
      const vengeanceShips = room.engine.entities.filter(
        (e) => e.isVengeanceHunter,
      );
      expect(vengeanceShips.length).toBe(3);

      const leader = vengeanceShips.find(
        (s) => s.name === "Federation Hunter Elite",
      );
      const alpha = vengeanceShips.find(
        (s) => s.name === "Federation Vengeance Wingman Alpha",
      );
      const beta = vengeanceShips.find(
        (s) => s.name === "Federation Vengeance Wingman Beta",
      );

      expect(leader).toBeDefined();
      expect(alpha).toBeDefined();
      expect(beta).toBeDefined();

      // Check combat ratings
      expect(leader.combatRating).toBe(320); // Elite
      expect(alpha.combatRating).toBe(200); // Dangerous

      // Check that they lock onto the player
      const leaderAi = room.ais.find((a) => a.ship === leader);
      expect(leaderAi.target).toBe(playerShip);

      // Verify that spawner logs are registered in SandboxSecurityRegistry
      const metrics = SandboxSecurityRegistry.getMetrics();
      expect(metrics.security_violations_total).toBe(1);
      const spawnLog = metrics.recent_violations[0];
      expect(spawnLog.action).toBe("vengeance_hunter_spawn");
      expect(spawnLog.details.faction).toBe("Federation");
      expect(spawnLog.details.wingSize).toBe(3);

      // Verify Chronicle dispatch entry
      expect(room.chronicle.events.length).toBe(1);
      expect(room.chronicle.events[0].title).toBe("Vengeance Wing Dispatched");
    } finally {
      room.destroy();
    }
  });

  test("Capping limits active vengeance hunters per sector to prevent infinite spawning", () => {
    const room = new GameInstance("cap-room", "Cap Sector");
    try {
      const playerId = "hostile-player";
      const playerShip = new Ship({
        id: playerId,
        name: "Commander Target",
        position: new Vector2D(0, 0),
      });
      room.engine.addEntity(playerShip);
      room.clients.set(playerId, {
        id: playerId,
        ship: playerShip,
        missionManager: {
          checkBountyCompletion: () => null,
        },
      });

      room.factionRegistry.adjustStanding(playerId, "Federation", -60);

      // Sweep 1: Spawns 3 ships
      room.checkEliteHunterSpawns(15);
      expect(
        room.engine.entities.filter(
          (e) => e.isVengeanceHunter && !e.isDestroyed,
        ).length,
      ).toBe(3);

      // Reset spawner cooldown to force another attempt
      room.lastEliteHunterSpawnTime = {};

      // Sweep 2: Should NOT spawn because a vengeance wing already exists in the sector
      room.checkEliteHunterSpawns(15);
      expect(
        room.engine.entities.filter(
          (e) => e.isVengeanceHunter && !e.isDestroyed,
        ).length,
      ).toBe(3);
    } finally {
      room.destroy();
    }
  });

  test("AI scanSensors locks onto and retains hostile player target", () => {
    const leaderShip = new Ship({
      id: "leader-1",
      name: "Federation Hunter Elite",
      position: new Vector2D(0, 0),
    });
    leaderShip.isVengeanceHunter = true;

    const playerShip = new Ship({
      id: "player-1",
      name: "Hostile Player",
      position: new Vector2D(100, 100),
    });

    const ai = new AIController(leaderShip, "guard", {
      useUtilityAdvisor: true,
    });
    ai.target = playerShip;

    // Call scanSensors. Since target is valid, it locks on and doesn't clear.
    const entities = [leaderShip, playerShip];
    ai.scanSensors(entities);

    expect(ai.target).toBe(playerShip);
  });

  test("Coordinated shielding: healthy wingman moves in front of damaged wing leader", () => {
    const room = new GameInstance("shield-room", "Shield Sector");
    try {
      // 1. Damaged Leader (shields <= 40%)
      const leader = new Ship({
        id: "leader",
        name: "Federation Hunter Elite",
        position: new Vector2D(0, 0),
        maxShield: 1000,
      });
      leader.shield = 300; // 30%, needs coordination manually assigned post-construct
      leader.isVengeanceHunter = true;

      // 2. Healthy Wingman (shields > 40%)
      const wingman = new Ship({
        id: "wingman",
        name: "Federation Vengeance Wingman Alpha",
        position: new Vector2D(100, 0),
        maxShield: 500,
      });
      wingman.shield = 500;
      wingman.isVengeanceHunter = true;

      // 3. Player Threat
      const player = new Ship({
        id: "player",
        name: "Hostile Player",
        position: new Vector2D(-300, 0),
      });

      room.engine.addEntity(leader);
      room.engine.addEntity(wingman);
      room.engine.addEntity(player);

      const leaderAi = new AIController(leader, "guard");
      leaderAi.target = player;
      room.ais.push(leaderAi);

      const wingmanAi = new AIController(wingman, "guard");
      wingmanAi.target = player;
      room.ais.push(wingmanAi);

      // Trigger AI updates so leader sets needsShieldCoordination and wingman coordinates shielding
      const entities = [leader, wingman, player];
      leaderAi.update(0.1, entities);
      expect(leader.needsShieldCoordination).toBe(true);

      wingmanAi.update(0.1, entities);

      // Verify healthy wingman steers toward the coordinated defensive position (in between leader and player threat)
      // Leader is at (0, 0). Threat is at (-300, 0).
      // Coordinated position should be: leader.pos + normalized(threat - leader) * 90 = (0, 0) + (-1, 0) * 90 = (-90, 0).
      expect(wingman.controls.isThrusting).toBe(true);
    } finally {
      room.destroy();
    }
  });

  test("Combat outcomes log to Chronicle and SandboxSecurityRegistry on destruction", () => {
    const room = new GameInstance("outcome-room", "Outcome Sector");
    try {
      room.chronicle = {
        events: [],
        recordEvent(ev) {
          this.events.push(ev);
        },
      };

      const playerId = "player-1";
      const playerShip = new Ship({
        id: playerId,
        name: "Commander Target",
        position: new Vector2D(0, 0),
      });
      room.engine.addEntity(playerShip);

      const client = {
        id: playerId,
        ship: playerShip,
        send: () => {},
        missionManager: {
          checkBountyCompletion: () => null,
        },
      };
      room.clients.set(playerId, client);

      const hunter = new Ship({
        id: "hunter-1",
        name: "Federation Hunter Elite",
        position: new Vector2D(100, 100),
      });
      hunter.isVengeanceHunter = true;
      hunter.faction = "Federation";
      room.engine.addEntity(hunter);

      // 1. Simulate Hunter Destroyed by player
      hunter.destroyedBy = playerId;
      room.handleEntityDestroyed(hunter);

      // Verify Chronicle has recorded "Vengeance Hunter Neutralized"
      const chronEvents = room.chronicle.events;
      const neutralizationEvent = chronEvents.find(
        (e) => e.title === "Vengeance Hunter Neutralized",
      );
      expect(neutralizationEvent).toBeDefined();
      expect(neutralizationEvent.impactMetrics.hunterName).toBe(
        "Federation Hunter Elite",
      );

      // Verify SandboxSecurityRegistry logged "vengeance_hunter_destroyed"
      let metrics = SandboxSecurityRegistry.getMetrics();
      const destroyedLog = metrics.recent_violations.find(
        (v) => v.action === "vengeance_hunter_destroyed",
      );
      expect(destroyedLog).toBeDefined();
      expect(destroyedLog.details.hunterName).toBe("Federation Hunter Elite");

      // 2. Simulate Player Executed by Hunter
      playerShip.destroyedBy = "hunter-1";
      // Manually set killer entity to mimic engine resolution
      room.engine.entities.push(hunter);
      room.handleEntityDestroyed(playerShip);

      // Verify Chronicle has recorded "Hostile Pilot Executed"
      const executionEvent = chronEvents.find(
        (e) => e.title === "Hostile Pilot Executed",
      );
      expect(executionEvent).toBeDefined();

      // Verify SandboxSecurityRegistry logged "player_executed_by_vengeance"
      metrics = SandboxSecurityRegistry.getMetrics();
      const executionLog = metrics.recent_violations.find(
        (v) => v.action === "player_executed_by_vengeance",
      );
      expect(executionLog).toBeDefined();
    } finally {
      room.destroy();
    }
  });
});
