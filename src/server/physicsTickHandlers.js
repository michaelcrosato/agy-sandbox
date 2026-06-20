import { NEBULAE } from "../engine/Nebulae.js";

/**
 * Updates AI entities in the room, handles caravan refueling and merchant destination routing.
 * @param {Object} room The active GameInstance room.
 * @param {number} dt The simulation tick time delta.
 */
export function updateAILogic(room, dt) {
  for (const ai of room.ais) {
    if (ai.ship.isDestroyed) continue;

    if (ai.isRefuelTanker && ai.refuelTargetId) {
      const targetClient = room.clients.get(ai.refuelTargetId);
      if (targetClient && targetClient.ship && !targetClient.ship.isDestroyed) {
        ai.destination = targetClient.ship.position.clone();

        const dist = ai.ship.position.distance(targetClient.ship.position);
        if (dist < 90) {
          targetClient.ship.hyperFuel = targetClient.ship.maxHyperFuel;
          targetClient.send({
            type: "notification",
            message:
              "Rescue Caravan: Allied Refuel Tanker transferred maximum hyperFuel!",
            style: "success",
          });
          targetClient.sendStats();

          const alertMsg = `RESCUE: ${targetClient.nickname} has been refueled by an allied Refuel Tanker.`;
          room.broadcastNotification(alertMsg, "info");
          room.broadcast({
            type: "chat",
            channel: "global",
            sender: "GALAXY-NEWS",
            text: alertMsg,
          });

          ai.ship.armor = 0;
          ai.ship.isDestroyed = true;
          room.engine.removeEntity(ai.ship.id);
          continue;
        }
      } else {
        ai.ship.armor = 0;
        ai.ship.isDestroyed = true;
        room.engine.removeEntity(ai.ship.id);
        continue;
      }
    }

    if (ai.role === "merchant" && !ai.destination) {
      const potentialHubs = room.planets.filter(
        (p) => p.position.distance(ai.ship.position) > 250,
      );
      if (potentialHubs.length > 0) {
        const nextHub =
          potentialHubs[Math.floor(Math.random() * potentialHubs.length)];
        ai.destination = nextHub.position.clone();
      }
    }
    ai.update(dt, room.engine.entities);
  }
}

/**
 * Applies pull forces from Tractor Beam Matrix to cargo pods.
 * @param {Object} room The active GameInstance room.
 */
export function applyTractorForces(room) {
  for (const ent of room.engine.entities) {
    if (ent.type === "ship" && !ent.isDestroyed) {
      if (ent.outfits && ent.outfits.includes("Tractor Beam Matrix")) {
        for (const pod of room.engine.entities) {
          if (pod.type === "cargo_pod") {
            const toShip = ent.position.subtract(pod.position);
            const dist = toShip.magnitude();
            if (dist > 1 && dist <= 250) {
              const forceMag = 400000 / (dist * dist + 100);
              const pullForce = toShip
                .normalize()
                .multiply(forceMag * pod.mass);
              pod.applyForce(pullForce);
            }
          }
        }
      }
    }
  }
}

/**
 * Handles cargo pod ingestion and collision, adding resources and sending alerts.
 * @param {Object} room The active GameInstance room.
 */
export function handleCargoCollection(room) {
  const podsToRemove = [];
  for (const pod of room.engine.entities) {
    if (pod.type === "cargo_pod") {
      for (const ship of room.engine.entities) {
        if (ship.type === "ship" && !ship.isDestroyed) {
          const dist = ship.position.distance(pod.position);
          if (dist <= ship.radius + pod.radius) {
            if (pod.isTrainingSalvage) {
              podsToRemove.push(pod);
              const client = Array.from(room.clients.values()).find(
                (c) => c.ship === ship,
              );
              if (client) {
                client.tutorialStep = "dock_at_port";
                client.send({
                  type: "notification",
                  message:
                    "Salvage harvested! Return to the spaceport and land [L] to complete onboarding.",
                  style: "success",
                });
                client.send({
                  type: "tutorial_state",
                  step: "dock_at_port",
                });
                client.send({
                  type: "cargo_pickup",
                  resourceType: pod.resourceType,
                  amount: pod.amount,
                  x: pod.position.x,
                  y: pod.position.y,
                });
                client.sendStats();
              }
              break;
            }

            const success = ship.addCargo(pod.resourceType, pod.amount);
            if (success) {
              podsToRemove.push(pod);
              const client = Array.from(room.clients.values()).find(
                (c) => c.ship === ship,
              );
              if (client) {
                client.send({
                  type: "notification",
                  message: `+${pod.amount} ${pod.resourceType.toUpperCase()} collected!`,
                  style: "success",
                });
                client.send({
                  type: "cargo_pickup",
                  resourceType: pod.resourceType,
                  amount: pod.amount,
                  x: pod.position.x,
                  y: pod.position.y,
                });
                client.sendStats();
              }
              break;
            } else {
              const client = Array.from(room.clients.values()).find(
                (c) => c.ship === ship,
              );
              if (
                client &&
                (!ship.lastCargoFullAlert ||
                  Date.now() - ship.lastCargoFullAlert > 2000)
              ) {
                ship.lastCargoFullAlert = Date.now();
                client.send({
                  type: "notification",
                  message:
                    "Cargo bay is FULL! Upgrade cargo holds or sell commodities.",
                  style: "error",
                });
              }
            }
          }
        }
      }
    }
  }

  for (const pod of podsToRemove) {
    room.engine.removeEntity(pod);
  }
}

/**
 * Applies drag multiplier and shield dampening from Nebulae to ships.
 * @param {Object} room The active GameInstance room.
 * @param {Map<Object, number>} originalRegens Map storing original shield regens to restore.
 */
export function applyNebulaHazards(room, originalRegens) {
  for (const ent of room.engine.entities) {
    if (ent.type === "ship" && !ent.isDestroyed) {
      let activeNebula = null;
      for (const neb of NEBULAE) {
        const dx = ent.position.x - neb.position.x;
        const dy = ent.position.y - neb.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= neb.radius) {
          activeNebula = neb;
          break;
        }
      }

      if (activeNebula) {
        if (room.engine.globalDrag > 0 && ent.velocity.magnitude() > 0) {
          const extraDragCoef = activeNebula.dragMultiplier - 1.0;
          const extraDragForce = ent.velocity.multiply(
            -extraDragCoef * room.engine.globalDrag * ent.mass,
          );
          ent.applyForce(extraDragForce);
        }
        if (activeNebula.hazardType === "shield_dampen") {
          const currentRegen = originalRegens.has(ent) ? 0 : ent.shieldRegen;
          if (!originalRegens.has(ent)) {
            originalRegens.set(ent, ent.shieldRegen);
          }
          ent.shieldRegen = currentRegen * 0.5;
        }
      }
    }
  }
}

/**
 * Applies energy drain, weapon cooldown double, and armor decay from Cosmic Storms.
 * @param {Object} room The active GameInstance room.
 * @param {number} dt The simulation tick time delta.
 * @param {Map<Object, number>} originalCooldowns Map storing original weapon cooldowns to restore.
 */
export function applyCosmicStormHazards(room, dt, originalCooldowns) {
  for (const ent of room.engine.entities) {
    if (ent.type === "ship" && !ent.isDestroyed) {
      for (const storm of room.engine.entities) {
        if (storm.type === "cosmic_storm") {
          const dx = ent.position.x - storm.position.x;
          const dy = ent.position.y - storm.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= storm.radius) {
            if (storm.hazardType === "emp_storm") {
              // Drain ship energy reserves (-15 energy/sec)
              ent.energy = Math.max(0, ent.energy - 15 * dt);
              // Double weapon cooldown delay
              if (!originalCooldowns.has(ent)) {
                originalCooldowns.set(ent, ent.weaponCooldown);
              }
              ent.weaponCooldown = originalCooldowns.get(ent) * 2.0;
            } else if (storm.hazardType === "radioactive_cloud") {
              // Deals slow, direct armor decay if shields are depleted (-5 armor/sec)
              if (ent.shield <= 0) {
                ent.armor = Math.max(0, ent.armor - 5 * dt);
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Shuts down shield regeneration on ships within range of a solar EMP planet event.
 * @param {Object} room The active GameInstance room.
 * @param {Map<Object, number>} originalRegens Map storing original shield regens to restore.
 */
export function applySolarEmpHazards(room, originalRegens) {
  if (room.activeSectorEvent && room.activeSectorEvent.type === "emp") {
    const empPlanet = room.planets.find(
      (p) => p.name === room.activeSectorEvent.planetName,
    );
    if (empPlanet) {
      for (const ent of room.engine.entities) {
        if (ent.type === "ship" && !ent.isDestroyed) {
          const dist = ent.position.distance(empPlanet.position);
          if (dist <= 400) {
            if (!originalRegens.has(ent)) {
              originalRegens.set(ent, ent.shieldRegen);
            }
            ent.shieldRegen = 0;
          }
        }
      }
    }
  }
}
