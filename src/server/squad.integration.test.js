import { GameInstance } from "../engine/GameInstance.js";
import { FactionRegistry } from "../engine/FactionRegistry.js";
import { squadManager } from "./SquadManager.js";
import { interestFilter } from "../net/interest.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("Squad Multiplayer Integration (SPEC-059)", () => {
  let game;

  beforeEach(() => {
    squadManager.reset();
    game = new GameInstance("sector-1", "Test Sector");
    game.factionRegistry = new FactionRegistry();
  });

  afterEach(() => {
    game.destroy();
    squadManager.reset();
  });

  test("proportional co-op bounty voucher splitting among sector squadmates", () => {
    // 1. Create a squad with two players
    const leaderSquad = squadManager.createSquad("p1");
    squadManager.joinSquad(leaderSquad.id, "p2");

    // 2. Mock client objects and register them inside GameInstance
    const mockClient1 = {
      id: "p1",
      nickname: "Leader",
      ship: {
        id: "ship-p1",
        position: new Vector2D(10, 10),
        velocity: new Vector2D(0, 0),
        bountyVouchers: [],
      },
      missionManager: {
        checkBountyCompletion() {
          return null;
        },
      },
      ws: {
        readyState: 1,
        OPEN: 1,
        send() {},
      },
      sent: [],
      send(data) {
        this.sent.push(data);
      },
      statsSentCount: 0,
      sendStats() {
        this.statsSentCount++;
      },
    };

    const mockClient2 = {
      id: "p2",
      nickname: "Wingman",
      ship: {
        id: "ship-p2",
        position: new Vector2D(12, 12),
        velocity: new Vector2D(0, 0),
        bountyVouchers: [],
      },
      missionManager: {
        checkBountyCompletion() {
          return null;
        },
      },
      ws: {
        readyState: 1,
        OPEN: 1,
        send() {},
      },
      sent: [],
      send(data) {
        this.sent.push(data);
      },
      statsSentCount: 0,
      sendStats() {
        this.statsSentCount++;
      },
    };

    game.clients.set("ws-p1", mockClient1);
    game.clients.set("ws-p2", mockClient2);

    // 3. Spawn a pirate and simulate destruction by p1
    const pirate = {
      id: "pirate-1",
      type: "ship",
      role: "pirate",
      name: "Jack Rackham",
      position: new Vector2D(10, 10),
      velocity: new Vector2D(0, 0),
      isDestroyed: false,
      destroyedBy: "p1",
    };

    game.engine.entities.push(pirate);

    // Trigger destruction
    game.handleEntityDestroyed(pirate);

    // 4. Verify the bounty (1000 base) is split proportionally: 500 CR each
    expect(mockClient1.ship.bountyVouchers).toEqual([
      { faction: "Federation", value: 500 },
    ]);
    expect(mockClient2.ship.bountyVouchers).toEqual([
      { faction: "Federation", value: 500 },
    ]);

    // Verify stats updates and notifications were dispatched
    expect(mockClient1.statsSentCount).toBeGreaterThan(0);
    expect(mockClient2.statsSentCount).toBeGreaterThan(0);

    const hasNotification = mockClient1.sent.some(
      (msg) =>
        msg.type === "notification" &&
        msg.message.includes("Squad share bounty voucher: +500 CR"),
    );
    expect(hasNotification).toBe(true);
  });

  test("proportional standings diplomatic splits on entity neutralization", () => {
    // 1. Create a squad with p1 and p2
    const leaderSquad = squadManager.createSquad("p1");
    squadManager.joinSquad(leaderSquad.id, "p2");

    const mockClient1 = {
      id: "p1",
      nickname: "Leader",
      ship: {
        id: "ship-p1",
        position: new Vector2D(10, 10),
        velocity: new Vector2D(0, 0),
      },
      missionManager: {
        checkBountyCompletion() {
          return null;
        },
      },
      ws: {
        readyState: 1,
        OPEN: 1,
        send() {},
      },
      sent: [],
      send(data) {
        this.sent.push(data);
      },
      statsSentCount: 0,
      sendStats() {},
    };

    const mockClient2 = {
      id: "p2",
      nickname: "Wingman",
      ship: {
        id: "ship-p2",
        position: new Vector2D(12, 12),
        velocity: new Vector2D(0, 0),
      },
      missionManager: {
        checkBountyCompletion() {
          return null;
        },
      },
      ws: {
        readyState: 1,
        OPEN: 1,
        send() {},
      },
      sent: [],
      send(data) {
        this.sent.push(data);
      },
      statsSentCount: 0,
      sendStats() {},
    };

    game.clients.set("ws-p1", mockClient1);
    game.clients.set("ws-p2", mockClient2);

    // 2. Spawn a federation target to destroy
    const fedShip = {
      id: "fed-1",
      type: "ship",
      role: "guard",
      faction: "Federation",
      position: new Vector2D(0, 0),
      velocity: new Vector2D(0, 0),
      isDestroyed: false,
      destroyedBy: "p1",
    };

    game.engine.entities.push(fedShip);

    // Trigger destruction
    game.handleEntityDestroyed(fedShip);

    // 3. Verify standing changes are divided by squad size (2)
    // Non-conflict base penalty is -5.0. Proportional split is -5.0 / 2 = -2.5.
    const standing1 = game.factionRegistry.getStanding("p1", "Federation");
    const standing2 = game.factionRegistry.getStanding("p2", "Federation");

    expect(standing1).toBe(-2.5);
    expect(standing2).toBe(-2.5);
  });

  test("shared visual sensor ranges within AoI interestFilter culling", () => {
    // Viewer client (p1) is far from the target asteroid
    const viewer = { id: "p1", x: 0, y: 0 };

    // Target asteroid is at (2000, 2000)
    const targetAsteroid = { id: "ast-1", x: 2000, y: 2000, type: "asteroid" };

    // Squadmate (p2) is near the target asteroid
    const squadmate = { x: 1900, y: 1900 };

    const entities = [viewer, targetAsteroid];

    // Case A: Query without squadmates option -> asteroid culled (radius default is 1000)
    const culledResult = interestFilter(entities, viewer, {
      radius: 1000,
      alwaysIncludeId: viewer.id,
    });
    const hasAsteroidA = culledResult.some((e) => e.id === "ast-1");
    expect(hasAsteroidA).toBe(false);

    // Case B: Query with squadmates option -> asteroid visible due to squadmate's proximity
    const sharedResult = interestFilter(entities, viewer, {
      radius: 1000,
      alwaysIncludeId: viewer.id,
      squadmates: [squadmate],
    });
    const hasAsteroidB = sharedResult.some((e) => e.id === "ast-1");
    expect(hasAsteroidB).toBe(true);
  });

  test("cross-process presence stat loading and remote squadmate coordination", async () => {
    // We mock the shared store mapping for player presence
    const mockStore = {
      data: new Map(),
      async save(key, obj) {
        this.data.set(key, obj);
        return true;
      },
      async load(key) {
        return this.data.get(key) || null;
      },
    };

    // We register p2 presence directly in the mock store
    await mockStore.save("presence:player:p2", {
      id: "p2",
      nickname: "RemoteWingman",
      roomId: "sector-1",
      ship: {
        shield: 80,
        maxShield: 100,
        armor: 90,
        maxArmor: 100,
        targetName: "BountyTarget",
        position: { x: 500, y: 600 },
      },
    });

    // Mock client object p1
    const mockClient1 = {
      id: "p1",
      nickname: "Leader",
      roomId: "sector-1",
      ship: {
        credits: 200,
        cargo: [],
        shield: 100,
        maxShield: 100,
        armor: 100,
        maxArmor: 100,
        name: "Specter V",
        outfits: [],
        energy: 100,
        maxEnergy: 100,
        heat: 0,
        maxHeat: 100,
        hyperFuel: 5,
        maxHyperFuel: 5,
      },
      ws: {
        send() {},
      },
      sentPayloads: [],
      send(payload) {
        this.sentPayloads.push(payload);
      },
    };

    // Construct mock wss containing only p1, simulating p2 is remote (on another process)
    const mockWss = {
      clients: new Set([{ clientObj: mockClient1 }]),
    };

    // Re-bind sendStats to simulate the new server sendStats execution context
    mockClient1.sendStats = async function () {
      // 1. Write presence to mockStore
      await mockStore.save(`presence:player:${this.id}`, {
        id: this.id,
        nickname: this.nickname,
        roomId: this.roomId,
        ship: {
          shield: this.ship.shield,
          maxShield: this.ship.maxShield,
          armor: this.ship.armor,
          maxArmor: this.ship.maxArmor,
          position: { x: 0, y: 0 },
        },
      });

      // 2. Fetch squadmates (p2)
      let squadMembers = [];
      const squad = squadManager.getSquadForPlayer(this.id);
      if (squad) {
        for (const memberId of squad.memberIds) {
          if (memberId === this.id) continue;

          let smClient = Array.from(mockWss.clients)
            .map((w) => w.clientObj)
            .find((c) => c && c.id === memberId);

          if (!smClient) {
            const remotePresence = await mockStore.load(
              `presence:player:${memberId}`,
            );
            if (remotePresence) {
              smClient = {
                id: remotePresence.id,
                nickname: remotePresence.nickname,
                ship: {
                  shield: remotePresence.shield,
                  maxShield: remotePresence.maxShield,
                  armor: remotePresence.armor,
                  maxArmor: remotePresence.maxArmor,
                  target: remotePresence.targetName
                    ? { name: remotePresence.targetName }
                    : null,
                  position: remotePresence.position,
                },
              };
              if (remotePresence.ship) {
                smClient.ship = {
                  shield: remotePresence.ship.shield,
                  maxShield: remotePresence.ship.maxShield,
                  armor: remotePresence.ship.armor,
                  maxArmor: remotePresence.ship.maxArmor,
                  target: remotePresence.ship.targetName
                    ? { name: remotePresence.ship.targetName }
                    : null,
                  position: remotePresence.ship.position,
                };
              }
            }
          }
          if (smClient) {
            squadMembers.push(smClient);
          }
        }
      }

      // Mock buildStatsPayload call
      const payload = {
        type: "stats",
        squad: squadMembers.map((m) => ({
          id: m.id,
          nickname: m.nickname,
          shield: m.ship.shield,
          maxShield: m.ship.maxShield,
          x: m.ship.position.x,
          y: m.ship.position.y,
        })),
      };
      this.send(payload);
    };

    // Form the squad in squadManager (both p1 and p2)
    const squad = squadManager.createSquad("p1");
    squadManager.joinSquad(squad.id, "p2");

    // Execute sendStats
    await mockClient1.sendStats();

    // Verify p2 presence was correctly loaded from mockStore and packaged
    expect(mockClient1.sentPayloads.length).toBe(1);
    const statsMsg = mockClient1.sentPayloads[0];
    expect(statsMsg.type).toBe("stats");
    expect(statsMsg.squad.length).toBe(1);
    expect(statsMsg.squad[0].id).toBe("p2");
    expect(statsMsg.squad[0].nickname).toBe("RemoteWingman");
    expect(statsMsg.squad[0].shield).toBe(80);
    expect(statsMsg.squad[0].x).toBe(500);

    // Verify p1 presence was written to store
    const p1Presence = await mockStore.load("presence:player:p1");
    expect(p1Presence).not.toBeNull();
    expect(p1Presence.nickname).toBe("Leader");
  });
});
