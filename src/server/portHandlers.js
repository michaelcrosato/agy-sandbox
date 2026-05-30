import { applyOutfitStats } from "../engine/Outfitting.js";
import {
  checkUpgradeLockout,
  redeemFactionVouchers,
} from "../engine/PortServices.js";
import {
  applyHullPurchase,
  getModifiedUpgradePrice,
} from "../engine/Trading.js";

/**
 * Handles purchase of an outfit from a planet.
 * @param {Object} clientObj - The socket client connection object.
 * @param {string} outfitName - Name of the outfit to purchase.
 * @param {Object} targetPlanet - The planet entity.
 * @param {Object|null} [room=null] - Dynamic GameInstance room.
 */
export function handleOutfitBuy(
  clientObj,
  outfitName,
  targetPlanet,
  room = null,
) {
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

  const factionRegistry = room ? room.factionRegistry : null;

  const lockout = checkUpgradeLockout(
    outfit.name,
    factionRegistry,
    clientObj.id,
    targetPlanet.faction,
  );
  if (!lockout.allowed) {
    clientObj.send({
      type: "notification",
      message: `Access Denied: Requires rank ${lockout.requiredRank} (Current: ${lockout.currentRank})!`,
      style: "error",
    });
    return;
  }
  const cost = getModifiedUpgradePrice(
    outfit.cost,
    factionRegistry,
    clientObj.id,
    targetPlanet.faction,
  );

  if (clientObj.ship.credits < cost) {
    clientObj.send({
      type: "notification",
      message: "Insufficient credits for upgrade!",
      style: "error",
    });
    return;
  }

  clientObj.ship.credits -= cost;
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
 * @param {Object|null} [room=null] - Dynamic GameInstance room.
 */
export function handleShipBuy(clientObj, shipName, targetPlanet, room = null) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded || !targetPlanet)
    return;

  const s = targetPlanet.shipyard.find((sh) => sh.name === shipName);
  if (!s) return;

  const factionRegistry = room ? room.factionRegistry : null;

  const lockout = checkUpgradeLockout(
    s.name,
    factionRegistry,
    clientObj.id,
    targetPlanet.faction,
  );
  if (!lockout.allowed) {
    clientObj.send({
      type: "notification",
      message: `Access Denied: Requires rank ${lockout.requiredRank} (Current: ${lockout.currentRank})!`,
      style: "error",
    });
    return;
  }
  const cost = getModifiedUpgradePrice(
    s.cost,
    factionRegistry,
    clientObj.id,
    targetPlanet.faction,
  );

  const result = applyHullPurchase(clientObj.ship, s, cost);
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

/**
 * Handles redemption of bounty vouchers.
 * @param {Object} clientObj - Client connection object.
 * @param {Object|null} [room=null] - Dynamic room.
 */
export function handleVoucherRedeem(clientObj, room = null) {
  if (
    !clientObj ||
    !clientObj.ship ||
    !clientObj.isLanded ||
    !clientObj.planetLandedOn
  ) {
    return;
  }

  const factionRegistry = room ? room.factionRegistry : null;
  const result = redeemFactionVouchers(
    clientObj.ship,
    clientObj.planetLandedOn.faction,
    factionRegistry,
    clientObj.id,
  );

  if (result.ok) {
    clientObj.send({
      type: "notification",
      message: `Successfully redeemed ${result.count} Bounty Vouchers! Earned +${result.creditsClaimed.toLocaleString()} CR and gained +${result.reputationGained.toFixed(1)} reputation standing merits!`,
      style: "success",
    });
    clientObj.sendStats();
  } else {
    let reasonMessage = "No bounty vouchers to redeem for this faction.";
    if (result.reason === "no_vouchers") {
      reasonMessage = "You do not have any bounty vouchers in your inventory.";
    } else if (result.reason === "no_matching_vouchers") {
      reasonMessage = `No vouchers available for redemption from the governing faction (${clientObj.planetLandedOn.faction}).`;
    }
    clientObj.send({
      type: "notification",
      message: reasonMessage,
      style: "error",
    });
  }
}
