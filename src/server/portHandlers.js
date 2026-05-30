import {
  applyOutfitStats,
  removeOutfitStats,
  validateSlotAvailability,
  getOutfitCategory,
} from "../engine/Outfitting.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";
import {
  checkUpgradeLockout,
  redeemFactionVouchers,
  applyRefine,
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

  const slotCheck = validateSlotAvailability(clientObj.ship, outfit);
  if (!slotCheck.allowed) {
    clientObj.send({
      type: "notification",
      message: slotCheck.reason,
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
    clientObj.ship,
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
    clientObj.ship,
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
      room.factionRegistry,
      clientObj.id,
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

/**
 * Handles sale of an equipped outfit back to the planet.
 * @param {Object} clientObj - The socket client connection object.
 * @param {string} outfitName - Name of the outfit to sell.
 * @param {Object} targetPlanet - The planet entity.
 * @param {Object|null} [room=null] - Dynamic GameInstance room.
 */
export function handleOutfitSell(
  clientObj,
  outfitName,
  targetPlanet,
  room = null,
) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded || !targetPlanet)
    return;

  const idx = clientObj.ship.outfits.indexOf(outfitName);
  if (idx === -1) {
    clientObj.send({
      type: "notification",
      message: "Upgrade not equipped!",
      style: "error",
    });
    return;
  }

  // Find outfit configuration
  let outfit = targetPlanet.outfitter
    ? targetPlanet.outfitter.find((o) => o.name === outfitName)
    : null;
  if (!outfit) {
    outfit = DEFAULT_OUTFITS.find((o) => o.name === outfitName);
  }

  // Safe fallback if it's the starter laser or not in catalog
  if (!outfit) {
    if (outfitName === "Basic Laser") {
      outfit = {
        name: "Basic Laser",
        cost: 0,
        type: "weapon",
        value: 0,
        mass: 0,
      };
    } else {
      clientObj.send({
        type: "notification",
        message: "Unknown outfit type!",
        style: "error",
      });
      return;
    }
  }

  const factionRegistry = room ? room.factionRegistry : null;
  const cost = getModifiedUpgradePrice(
    outfit.cost,
    factionRegistry,
    clientObj.id,
    targetPlanet.faction,
  );

  const refund = Math.floor(cost * 0.9);

  // Remove from ship's outfits
  clientObj.ship.outfits.splice(idx, 1);

  // Remove the outfit statistics and mass from the ship
  removeOutfitStats(clientObj.ship, outfit);

  // Refund credits
  clientObj.ship.credits += refund;

  clientObj.send({
    type: "notification",
    message: `Sold: ${outfit.name} for ${refund.toLocaleString()} CR!`,
    style: "success",
  });
  clientObj.sendStats();
}

/**
 * Saves current outfitting configuration to a custom preset slot.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} presetIndex - Index of the preset to save (0, 1, or 2).
 */
export function handlePresetSave(clientObj, presetIndex) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded) return;

  if (typeof presetIndex !== "number" || presetIndex < 0 || presetIndex > 2) {
    clientObj.send({
      type: "notification",
      message: "Invalid preset slot (0-2)!",
      style: "error",
    });
    return;
  }

  if (!Array.isArray(clientObj.presets)) {
    clientObj.presets = [null, null, null];
  }

  clientObj.presets[presetIndex] = [...clientObj.ship.outfits];

  clientObj.send({
    type: "notification",
    message: `Saved Loadout Preset ${presetIndex + 1}!`,
    style: "success",
  });
}

/**
 * Loads a custom preset configuration, enforcing transactions and slots.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} presetIndex - Index of the preset to load (0, 1, or 2).
 * @param {Object} targetPlanet - The planet entity player is landed on.
 * @param {Object|null} [room=null] - Dynamic GameInstance room.
 */
export function handlePresetLoad(
  clientObj,
  presetIndex,
  targetPlanet,
  room = null,
) {
  if (!clientObj || !clientObj.ship || !clientObj.isLanded || !targetPlanet)
    return;

  if (typeof presetIndex !== "number" || presetIndex < 0 || presetIndex > 2) {
    clientObj.send({
      type: "notification",
      message: "Invalid preset slot (0-2)!",
      style: "error",
    });
    return;
  }

  if (!Array.isArray(clientObj.presets) || !clientObj.presets[presetIndex]) {
    clientObj.send({
      type: "notification",
      message: `No preset saved in slot ${presetIndex + 1}!`,
      style: "error",
    });
    return;
  }

  const targetPreset = clientObj.presets[presetIndex];
  const factionRegistry = room ? room.factionRegistry : null;

  // Validate slot availability for targetPreset
  let weapons = 0;
  let shields = 0;
  let utilities = 0;
  for (const name of targetPreset) {
    if (name === "Basic Laser") {
      weapons++;
      continue;
    }
    const outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (outfit) {
      const cat = getOutfitCategory(outfit.type);
      if (cat === "weapon") weapons++;
      else if (cat === "shield") shields++;
      else if (cat === "utility") utilities++;
    }
  }

  if (weapons > 2) {
    clientObj.send({
      type: "notification",
      message: "Preset exceeds Weapon slots cap (Max 2)!",
      style: "error",
    });
    return;
  }
  if (shields > 1) {
    clientObj.send({
      type: "notification",
      message: "Preset exceeds Shield slot cap (Max 1)!",
      style: "error",
    });
    return;
  }
  if (utilities > 1) {
    clientObj.send({
      type: "notification",
      message: "Preset exceeds Utility slot cap (Max 1)!",
      style: "error",
    });
    return;
  }

  // Calculate kept, toSell, and toBuy items
  let current = [...clientObj.ship.outfits];
  let target = [...targetPreset];
  let toSell = [];

  for (const name of [...current]) {
    const tIdx = target.indexOf(name);
    if (tIdx !== -1) {
      target.splice(tIdx, 1);
      const cIdx = current.indexOf(name);
      current.splice(cIdx, 1);
    } else {
      toSell.push(name);
      const cIdx = current.indexOf(name);
      current.splice(cIdx, 1);
    }
  }
  const toBuy = target;

  // Verify rank requirements and calculate cost for buying
  let totalCost = 0;
  for (const name of toBuy) {
    const outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (!outfit) continue;

    // Check rank lockout
    const lockout = checkUpgradeLockout(
      outfit.name,
      factionRegistry,
      clientObj.id,
      targetPlanet.faction,
      clientObj.ship,
    );
    if (!lockout.allowed) {
      clientObj.send({
        type: "notification",
        message: `Rank Locked: Preset has ${outfit.name} which requires rank ${lockout.requiredRank}!`,
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
    totalCost += cost;
  }

  // Calculate refund from selling
  let totalRefund = 0;
  for (const name of toSell) {
    let outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (!outfit && name === "Basic Laser") {
      outfit = {
        name: "Basic Laser",
        cost: 0,
        type: "weapon",
        value: 0,
        mass: 0,
      };
    }
    if (!outfit) continue;

    const cost = getModifiedUpgradePrice(
      outfit.cost,
      factionRegistry,
      clientObj.id,
      targetPlanet.faction,
    );
    totalRefund += Math.floor(cost * 0.9);
  }

  const netCreditsChange = totalRefund - totalCost;
  if (clientObj.ship.credits + netCreditsChange < 0) {
    clientObj.send({
      type: "notification",
      message: `Insufficient credits to load preset! Cost: ${(totalCost - totalRefund).toLocaleString()} CR`,
      style: "error",
    });
    return;
  }

  // Apply the preset
  const originalOutfits = [...clientObj.ship.outfits];
  for (const name of originalOutfits) {
    let outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (!outfit && name === "Basic Laser") {
      outfit = {
        name: "Basic Laser",
        cost: 0,
        type: "weapon",
        value: 0,
        mass: 0,
      };
    }
    if (outfit) {
      removeOutfitStats(clientObj.ship, outfit);
    }
  }
  clientObj.ship.outfits = [];

  for (const name of targetPreset) {
    clientObj.ship.outfits.push(name);
    let outfit = DEFAULT_OUTFITS.find((o) => o.name === name);
    if (!outfit && name === "Basic Laser") {
      outfit = {
        name: "Basic Laser",
        cost: 0,
        type: "weapon",
        value: 0,
        mass: 0,
      };
    }
    if (outfit) {
      applyOutfitStats(clientObj.ship, outfit);
    }
  }

  clientObj.ship.credits += netCreditsChange;

  clientObj.send({
    type: "notification",
    message: `Loaded Preset ${presetIndex + 1}! Net Transaction: ${netCreditsChange >= 0 ? "+" : ""}${netCreditsChange.toLocaleString()} CR`,
    style: "success",
  });
  clientObj.sendStats();
}

/**
 * Handles refining raw ore into minerals (or machinery) on command.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} quantity - Quantity of raw 'ore' to refine.
 * @param {string} targetCommodity - Target refined commodity.
 * @param {Object} room - Dynamic GameInstance room.
 */
export function handleOreRefine(clientObj, quantity, targetCommodity, room) {
  if (
    !clientObj ||
    !clientObj.ship ||
    !clientObj.isLanded ||
    !clientObj.planetLandedOn ||
    !room
  ) {
    return;
  }

  const qty = parseInt(String(quantity), 10);
  const targetComm = targetCommodity || "minerals";
  const registry = room.factionRegistry || room.engine.factionRegistry || null;

  const r = applyRefine(
    clientObj.ship,
    clientObj.planetLandedOn,
    qty,
    {},
    registry,
    clientObj.id,
    targetComm,
  );

  if (r.ok) {
    clientObj.send({
      type: "notification",
      message: `Refined ${r.refined} units of raw ore into ${r.produced} units of ${targetComm} for ${r.cost} CR.`,
      style: "success",
    });
    clientObj.sendStats();
  } else {
    let errorMsg = "Refining failed.";
    if (r.reason === "no_refinery_services") {
      errorMsg = "This planet does not possess refinery services.";
    } else if (r.reason === "invalid_target_commodity") {
      errorMsg = "Invalid target commodity for refining.";
    } else if (r.reason === "invalid_quantity") {
      errorMsg = "Invalid refine quantity specified.";
    } else if (
      r.reason &&
      r.reason.startsWith("quantity_must_be_multiple_of")
    ) {
      errorMsg = r.reason.replace(/_/g, " ");
    } else if (r.reason === "insufficient_ore") {
      errorMsg = "You do not possess enough raw ore in your cargo.";
    } else if (r.reason === "insufficient_credits") {
      errorMsg = `Insufficient credits! Needs ${r.cost} CR.`;
    } else if (r.reason === "cargo_full") {
      errorMsg = "Cargo hold is full!";
    }
    clientObj.send({
      type: "notification",
      message: errorMsg,
      style: "error",
    });
  }
}
