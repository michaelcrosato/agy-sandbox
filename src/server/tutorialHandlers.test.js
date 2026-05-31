import { jest } from "@jest/globals";
import {
  handleTutorialStart,
  handleTutorialProgress,
  handleTutorialComplete,
} from "./tutorialHandlers.js";
import { handleControls } from "./gameplayHandlers.js";
import { Ship } from "../engine/Ship.js";
import { Vector2D } from "../physics/Vector2D.js";

describe("tutorialHandlers Deep Integration & FSM Test Suite (SPEC-158)", () => {
  let clientObj;
  let instances;
  let persistenceManager;
  let joinRoomMock;

  beforeEach(() => {
    // 1. Establish authentic Player Ship
    const playerShip = new Ship({
      id: "p1",
      name: "NeoPilot",
      position: new Vector2D(100, 100),
      velocity: new Vector2D(0, 0),
      maxShield: 200,
      maxArmor: 100,
      credits: 100,
    });

    // 2. Setup mock client connection
    clientObj = {
      id: "p1",
      nickname: "NeoPilot",
      isLanded: true,
      planetLandedOn: "Sol Station",
      roomId: null,
      tutorialCompleted: false,
      tutorialStep: null,
      tutorialRotationDone: false,
      tutorialThrustDone: false,
      ship: playerShip,
      send: jest.fn(),
      sendStats: jest.fn(),
      chronicle: {
        recordEvent: jest.fn(),
      },
      missionManager: {
        checkBountyCompletion: jest.fn(() => null),
      },
    };

    instances = new Map();
    persistenceManager = {
      savePlayer: jest.fn(),
    };

    joinRoomMock = jest.fn(async (client, roomId, nickname) => {
      if (client.roomId) {
        const prev = instances.get(client.roomId);
        if (prev) {
          prev.clients.delete(client.id);
        }
      }
      client.roomId = roomId;
      client.nickname = nickname;
      const room = instances.get(roomId);
      if (room) {
        room.clients.set(client.id, client);
      }
    });
  });

  test("starts tutorial, spawns private sector room and weak training drone, and transitions step", async () => {
    await handleTutorialStart(clientObj, instances, joinRoomMock);

    expect(clientObj.isLanded).toBe(false);
    expect(clientObj.planetLandedOn).toBeNull();
    expect(clientObj.roomId).toBe("tutorial-p1");
    expect(clientObj.tutorialStep).toBe("thrust_maneuver");
    expect(clientObj.tutorialRotationDone).toBe(false);
    expect(clientObj.tutorialThrustDone).toBe(false);

    const room = instances.get("tutorial-p1");
    expect(room).toBeDefined();
    expect(room.isTutorialRoom).toBe(true);

    // Verify Training Drone was spawned
    const drone = room.engine.entities.find((e) => e.name === "Training Drone");
    expect(drone).toBeDefined();
    expect(drone.type).toBe("ship");
    expect(drone.weaponDamage).toBe(0); // Safe training laser
    expect(drone.maxShield).toBe(40);
    expect(drone.maxArmor).toBe(40);

    // Verify notifications were dispatched to player cockpit HUD
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "COCKPIT ONBOARDING ACTIVATED. IGNITE THRUSTERS TO BEGIN!",
      style: "success",
    });

    expect(clientObj.send).toHaveBeenCalledWith({
      type: "tutorial_state",
      step: "thrust_maneuver",
      isRotationDone: false,
      isThrustDone: false,
    });
  });

  test("tracks controls inputs and automatically advances to lock_target step", async () => {
    await handleTutorialStart(clientObj, instances, joinRoomMock);

    // Simulate rotation input only
    handleControls(clientObj, {
      controls: { left: true },
      heading: 0.5,
    });

    expect(clientObj.tutorialRotationDone).toBe(true);
    expect(clientObj.tutorialThrustDone).toBe(false);
    expect(clientObj.tutorialStep).toBe("thrust_maneuver");

    // Simulate forward thrust input
    handleControls(clientObj, {
      controls: { forward: true },
      heading: 0.5,
    });

    expect(clientObj.tutorialThrustDone).toBe(true);
    expect(clientObj.tutorialRotationDone).toBe(true);

    // Verify player automatically advanced to lock_target step
    expect(clientObj.tutorialStep).toBe("lock_target");
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "Thrusters verified! Target the Training Drone scanner.",
      style: "success",
    });
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "tutorial_state",
      step: "lock_target",
    });
  });

  test("handles client-triggered step progression signals", () => {
    clientObj.tutorialStep = "thrust_maneuver";

    handleTutorialProgress(clientObj, { step: "lock_target" });
    expect(clientObj.tutorialStep).toBe("lock_target");

    handleTutorialProgress(clientObj, { step: "destroy_drone" });
    expect(clientObj.tutorialStep).toBe("destroy_drone");
  });

  test("Training Drone destruction drops special training salvage cargo pod", async () => {
    await handleTutorialStart(clientObj, instances, joinRoomMock);
    const room = instances.get("tutorial-p1");

    const drone = room.engine.entities.find((e) => e.name === "Training Drone");
    expect(drone).toBeDefined();

    // Destroy the drone
    drone.destroyedBy = "p1";
    room.handleEntityDestroyed(drone);

    // Verify a cargo pod with isTrainingSalvage = true was spawned
    const pod = room.engine.entities.find((e) => e.type === "cargo_pod");
    expect(pod).toBeDefined();
    expect(pod.isTrainingSalvage).toBe(true);
    expect(pod.resourceType).toBe("Wreckage Salvage");

    // Verify tutorial transitioned to collect_salvage step
    expect(clientObj.tutorialStep).toBe("collect_salvage");
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message:
        "Training Drone neutralized! Deploy cargo scoop and harvest the wreckage salvage pod.",
      style: "success",
    });
  });

  test("completes tutorial, awards rewards, and cleans up room resources", async () => {
    await handleTutorialStart(clientObj, instances, joinRoomMock);
    const room = instances.get("tutorial-p1");

    // Mock completing the tutorial
    await handleTutorialComplete(
      clientObj,
      instances,
      persistenceManager,
      joinRoomMock,
    );

    expect(clientObj.tutorialCompleted).toBe(true);
    expect(clientObj.tutorialStep).toBe("completed");
    expect(clientObj.ship.credits).toBe(600); // 100 + 500 CR awarded

    // Verify Galactic Chronicle records history entries
    expect(room.chronicle.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "combat",
        title: "Pilot Commissioned",
      }),
    );

    // Verify player is transitioned back to the public sector shard
    expect(clientObj.roomId).toBe("public");

    // Verify tutorial sector was garbage collected cleanly
    expect(instances.has("tutorial-p1")).toBe(false);
  });
});
