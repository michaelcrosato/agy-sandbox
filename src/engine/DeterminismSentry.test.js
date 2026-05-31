import { DeterminismSentry } from "./DeterminismSentry.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("DeterminismSentry Unit Tests", () => {
  let sentry;

  beforeEach(() => {
    sentry = new DeterminismSentry();
  });

  test("should initialize with zero alerts and empty historical tracking state", () => {
    expect(sentry.getDriftAlertsTotal()).toBe(0);
    expect(sentry.lastFrameHash).toBeNull();
  });

  test("FNV-1a static method produces deterministic non-zero hashes", () => {
    const hash1 = DeterminismSentry.fnv1a("test-entity-string");
    const hash2 = DeterminismSentry.fnv1a("test-entity-string");
    const hash3 = DeterminismSentry.fnv1a("different-string");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1).not.toBe(0);
  });

  test("combineHashes combines two hashes deterministically", () => {
    const h1 = DeterminismSentry.fnv1a("hash1");
    const h2 = DeterminismSentry.fnv1a("hash2");

    const combined1 = DeterminismSentry.combineHashes(h1, h2);
    const combined2 = DeterminismSentry.combineHashes(h1, h2);

    expect(combined1).toBe(combined2);
    expect(combined1).not.toBe(h1);
    expect(combined1).not.toBe(h2);
  });

  test("audit returns non-zero hash for game instance and keeps alerts at zero when state is stable", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
      factionRegistry: {
        standings: {
          "player-1": { Federation: 20 },
        },
      },
    };

    const hash = sentry.audit(mockGame);
    expect(hash).not.toBe(0);
    expect(sentry.getDriftAlertsTotal()).toBe(0);
  });

  test("two consecutive audits with identical states yield identical hashes and zero alerts", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
    };

    const hash1 = sentry.audit(mockGame);
    const hash2 = sentry.audit(mockGame);

    expect(hash1).toBe(hash2);
    expect(sentry.getDriftAlertsTotal()).toBe(0);
  });

  test("moving an entity small distances normally does not trigger drift warnings", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
    };

    sentry.audit(mockGame);

    // Evolve position normally (e.g. by 10 units)
    mockEntity.position.x += 10;
    sentry.audit(mockGame);

    expect(sentry.getDriftAlertsTotal()).toBe(0);
  });

  test("coordinate jump exceeding 500 units triggers a determinism drift alert", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
    };

    sentry.audit(mockGame);

    // Sudden warp/jump of 600 units
    mockEntity.position.x += 600;
    sentry.audit(mockGame);

    expect(sentry.getDriftAlertsTotal()).toBe(1);
  });

  test("NaN coordinates trigger a state corruption drift alert", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
    };

    sentry.audit(mockGame);

    // Corrupt the coordinates with NaN
    mockEntity.position.x = NaN;
    sentry.audit(mockGame);

    expect(sentry.getDriftAlertsTotal()).toBe(1);
  });

  test("Infinite coordinates trigger a state corruption drift alert", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
    };

    sentry.audit(mockGame);

    // Corrupt the coordinates with Infinity
    mockEntity.position.x = Infinity;
    sentry.audit(mockGame);

    expect(sentry.getDriftAlertsTotal()).toBe(1);
  });

  test("standing matrix modification alters hash output deterministically", () => {
    const mockEntity = {
      id: "ship-1",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(10, 0),
      heading: 1.5,
      mass: 500,
      isDestroyed: false,
    };

    const mockGame = {
      engine: {
        entities: [mockEntity],
      },
      factionRegistry: {
        standings: {
          "player-1": { Federation: 20 },
        },
      },
    };

    const hash1 = sentry.audit(mockGame);

    // Alter standing matrix
    mockGame.factionRegistry.standings["player-1"].Federation = -45;
    const hash2 = sentry.audit(mockGame);

    expect(hash1).not.toBe(hash2);
    expect(sentry.getDriftAlertsTotal()).toBe(0);
  });
});
