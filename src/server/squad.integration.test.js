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
});
