import { GameInstance } from "../engine/GameInstance.js";
import { Ship } from "../engine/Ship.js";
import { Vector2D } from "../physics/Vector2D.js";
import { AIController } from "../engine/ai/AIController.js";

/**
 * Handles starting the dynamic interactive tutorial.
 * Spawns a dedicated private sector room, seeds a Training Drone,
 * and sets the client tutorialStep to thrust_maneuver.
 *
 * @param {Object} clientObj - The active client connection object.
 * @param {Map} instances - Map of active room instances on server.
 * @param {Function} joinRoom - Function to join a client to a room.
 */
export async function handleTutorialStart(clientObj, instances, joinRoom) {
  if (!clientObj || !clientObj.isLanded) return;

  clientObj.tutorialCompleted = false;
  const newRoomId = "tutorial-" + clientObj.id;

  // 1. Create or reset the dynamic tutorial room sector
  let room = instances.get(newRoomId);
  if (!room) {
    room = new GameInstance(newRoomId, "Tutorial Sector");
    room.isTutorialRoom = true;
    room.chronicle = clientObj.chronicle || null;
    instances.set(newRoomId, room);
    console.log(
      `🌌 Spawned dynamic tutorial sector room for client: [${clientObj.nickname}] (${newRoomId})`,
    );
  } else {
    // Reset room entities
    room.engine.entities = room.engine.entities.filter(
      (e) =>
        e.name !== "Training Drone" &&
        !e.isTrainingSalvage &&
        e.id !== clientObj.ship?.id,
    );
    room.ais = room.ais.filter(
      (ai) => ai.ship && ai.ship.name !== "Training Drone",
    );
  }

  // 2. Launch ship and join sector room
  clientObj.isLanded = false;
  clientObj.planetLandedOn = null;
  await joinRoom(clientObj, newRoomId, clientObj.nickname);

  // Reset tutorial state variables
  clientObj.tutorialStep = "thrust_maneuver";
  clientObj.tutorialRotationDone = false;
  clientObj.tutorialThrustDone = false;

  // 3. Spawn a basic Training Drone near player ship
  if (clientObj.ship) {
    const spawnPos = clientObj.ship.position.add(new Vector2D(350, 150));
    const droneShip = new Ship({
      name: "Training Drone",
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 40,
      maxArmor: 40,
      thrustPower: 14000,
      turnRate: 1.8,
      weaponDamage: 0, // Training drone does no weapon damage
      weaponCooldown: 10.0,
    });
    droneShip.faction = "Federation";
    droneShip.role = "guard";
    droneShip.combatValue = 0;

    const controller = new AIController(droneShip, "guard", {
      useUtilityAdvisor: true,
      factionRegistry: room.factionRegistry,
    });
    controller.target = clientObj.ship;

    room.engine.addEntity(droneShip);
    room.ais.push(controller);
  }

  clientObj.send({
    type: "notification",
    message: "COCKPIT ONBOARDING ACTIVATED. IGNITE THRUSTERS TO BEGIN!",
    style: "success",
  });

  clientObj.send({
    type: "tutorial_state",
    step: "thrust_maneuver",
    isRotationDone: false,
    isThrustDone: false,
  });

  clientObj.sendStats();
}

/**
 * Handles client-triggered step progression signals.
 *
 * @param {Object} clientObj - The active client connection object.
 * @param {Object} msg - The incoming message payload.
 */
export function handleTutorialProgress(clientObj, msg) {
  if (!clientObj || !clientObj.tutorialStep) return;

  const current = clientObj.tutorialStep;
  const targetStep = msg.step;

  if (current === "thrust_maneuver" && targetStep === "lock_target") {
    clientObj.tutorialStep = "lock_target";
    clientObj.send({
      type: "notification",
      message: "Thrusters verified! Target the Training Drone scanner.",
      style: "success",
    });
    clientObj.send({
      type: "tutorial_state",
      step: "lock_target",
    });
  } else if (current === "lock_target" && targetStep === "destroy_drone") {
    clientObj.tutorialStep = "destroy_drone";
    clientObj.send({
      type: "notification",
      message:
        "Target locked. Weapons hot! Engage and destroy the Training Drone.",
      style: "success",
    });
    clientObj.send({
      type: "tutorial_state",
      step: "destroy_drone",
    });
  }
}

/**
 * Handles concluding the tutorial onboarding.
 * Awards starter credits, saves progress, chronicles history, and moves player back to public room.
 *
 * @param {Object} clientObj - The active client connection.
 * @param {Map} instances - The Map of active room instances.
 * @param {Object} persistenceManager - Dynamic persistence.
 * @param {Function} joinRoom - Room transition helper.
 */
export async function handleTutorialComplete(
  clientObj,
  instances,
  persistenceManager,
  joinRoom,
) {
  if (!clientObj.tutorialCompleted) {
    clientObj.tutorialCompleted = true;
    clientObj.tutorialStep = "completed";

    if (clientObj.ship) {
      clientObj.ship.credits = (clientObj.ship.credits || 0) + 500;
    }

    clientObj.send({
      type: "notification",
      message: "ONBOARDING COMPLETE: +500 CR awarded!",
      style: "success",
    });

    clientObj.send({
      type: "tutorial_state",
      step: "completed",
    });

    clientObj.sendStats();

    // Record dynamic entry into Galactic Chronicle history database
    const activeRoom = clientObj.roomId
      ? instances.get(clientObj.roomId)
      : null;
    if (activeRoom && activeRoom.chronicle) {
      activeRoom.chronicle.recordEvent({
        sector: activeRoom.id,
        category: "combat",
        title: "Pilot Commissioned",
        description: `Pilot ${clientObj.nickname || "Unknown"} has completed advanced flight onboarding certification and has been formally commissioned!`,
        impactMetrics: { pilot: clientObj.nickname },
      });
    }

    // Immediately persist completion state to disk
    if (activeRoom && persistenceManager) {
      persistenceManager.savePlayer(clientObj.id, clientObj, activeRoom.id);
    }

    // Transition player back into the public persistent sector shard
    if (joinRoom) {
      await joinRoom(clientObj, "public", clientObj.nickname);
    }

    // Safely cleanup the dynamic tutorial room if it exists and has no other clients
    const tutorialRoomId = "tutorial-" + clientObj.id;
    const tutRoom = instances.get(tutorialRoomId);
    if (tutRoom) {
      const activeClients = Array.from(tutRoom.clients.values());
      if (activeClients.length === 0) {
        instances.delete(tutorialRoomId);
        console.log(
          `🧹 Garbage Collected completed tutorial room: (${tutorialRoomId})`,
        );
      }
    }
  }
}
