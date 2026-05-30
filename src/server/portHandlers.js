import { applyOutfitStats } from "../engine/Outfitting.js";
import { applyHullPurchase } from "../engine/Trading.js";

/**
 * Handles purchase of an outfit from a planet.
 * @param {Object} clientObj - The socket client connection object.
 * @param {string} outfitName - Name of the outfit to purchase.
 * @param {Object} targetPlanet - The planet entity.
 */
export function handleOutfitBuy(clientObj, outfitName, targetPlanet) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded || !targetPlanet)
    return;

  const outfit = targetPlanet.outfitter.find((o) => o.name === outfitName);
  if (!outfit) return;

  if (clientObj.ship.outfits.includes(outfit.name)) {
    clientObj.send({
      type: "notification",
      message: "Upgrade already equipped!",
      style: "error",
    });
    return;
  }

  if (clientObj.ship.credits < outfit.cost) {
    clientObj.send({
      type: "notification",
      message: "Insufficient credits for upgrade!",
      style: "error",
    });
    return;
  }

  clientObj.ship.credits -= outfit.cost;
  clientObj.ship.outfits.push(outfit.name);

  applyOutfitStats(clientObj.ship, outfit);

  clientObj.send({
    type: "notification",
    message: `Equipped: ${outfit.name}!`,
    style: "success",
  });
  clientObj.sendStats();
}

/**
 * Handles purchase of a new ship hull from a shipyard.
 * @param {Object} clientObj - The socket client connection object.
 * @param {string} shipName - Name of the ship hull type.
 * @param {Object} targetPlanet - The planet entity.
 */
export function handleShipBuy(clientObj, shipName, targetPlanet) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded || !targetPlanet)
    return;

  const s = targetPlanet.shipyard.find((sh) => sh.name === shipName);
  if (!s) return;

  const result = applyHullPurchase(clientObj.ship, s);
  if (result.ok) {
    clientObj.send({
      type: "notification",
      message: `Acquired new ship: ${s.name}!`,
      style: "success",
    });
    clientObj.sendStats();
  } else {
    clientObj.send({
      type: "notification",
      message: "Insufficient credits for ship purchase!",
      style: "error",
    });
  }
}

/**
 * Handles accepting a dynamic generative mission.
 * @param {Object} clientObj - The socket client connection object.
 * @param {string} planetName - Governing planet where the mission resides.
 * @param {string} missionId - The unique ID of the mission.
 * @param {Object} targetPlanet - The planet entity.
 * @param {Object} room - The dynamic GameInstance room.
 */
export function handleMissionAccept(
  clientObj,
  planetName,
  missionId,
  targetPlanet,
  room,
) {
  if (
    !clientObj ||
    !clientObj.ship ||
    !clientObj.isLanded ||
    !targetPlanet ||
    !room
  )
    return;

  if (!clientObj.missionManager.availableMissions[planetName]) {
    clientObj.missionManager.generateMissionsForPlanet(
      planetName,
      room.planets,
    );
  }

  const res = clientObj.missionManager.acceptMission(
    planetName,
    missionId,
    clientObj.ship,
  );
  if (res.success) {
    clientObj.send({
      type: "notification",
      message: res.message,
      style: "success",
    });
    clientObj.sendStats();
  } else {
    clientObj.send({
      type: "notification",
      message: res.message,
      style: "error",
    });
  }
}

/**
 * Handles abandoning an active mission.
 * @param {Object} clientObj - The socket client connection object.
 * @param {string} missionId - The unique ID of the active mission.
 */
export function handleMissionAbandon(clientObj, missionId) {
  if (!clientObj || !clientObj.ship) return;

  const activeM = clientObj.missionManager.activeMissions.find(
    (m) => m.id === missionId,
  );
  if (activeM) {
    clientObj.missionManager.abandonMission(missionId, clientObj.ship);
    clientObj.send({
      type: "notification",
      message: `Abandoned contract: ${activeM.title}`,
      style: "info",
    });
    clientObj.sendStats();
  }
}

/**
 * Handles transmitting tactical orders to player escorts.
 * @param {Object} clientObj - The socket client connection object.
 * @param {Object} msg - The command message payload containing "command" and optional "targetId".
 * @param {Object} room - Dynamic GameInstance room.
 */
export function handleEscortCommand(clientObj, msg, room) {
  if (!clientObj || !clientObj.ship || !room || !msg) return;

  const command = msg.command;
  if (command === "attack" && msg.targetId) {
    const target = room.engine.getEntity(msg.targetId);
    if (target && !target.isDestroyed) {
      clientObj.ship.target = target;
    }
  }

  let count = 0;
  for (const ai of room.ais) {
    if (ai.role === "escort" && ai.flagship === clientObj.ship) {
      ai.escortMode = command;
      count++;
    }
  }

  clientObj.send({
    type: "notification",
    message: `Transmitted [${command.toUpperCase()}] commands to ${count} AI wingmen.`,
    style: "success",
  });
}
