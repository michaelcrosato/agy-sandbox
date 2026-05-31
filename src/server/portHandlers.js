import {
  applyOutfitStats,
  removeOutfitStats,
  validateSlotAvailability,
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
import { canLoadPreset, getPresetOutfits } from "../engine/LoadoutManager.js";
import {
  createSeededRng,
  DEFAULT_GENERATIVE_OPTIONS,
} from "../engine/GenerativeMissions.js";
import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";
import { AIController } from "../engine/ai/AIController.js";

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
    let generated = [];
    if (typeof clientObj.missionManager.generateWorldMissions === "function") {
      const bountyTargets =
        room && room.ships && typeof room.ships.values === "function"
          ? Array.from(room.ships.values())
              .filter(
                (s) =>
                  s &&
                  s.type === "ship" &&
                  s.id !== clientObj.id &&
                  s.bountyValue,
              )
              .map((s) => ({
                id: s.id,
                name: s.name,
                bountyValue: s.bountyValue,
                faction: s.faction,
              }))
          : [];

      const world = {
        planets: room.planets,
        baseMarkets: room.baseMarkets || {},
        bountyTargets: bountyTargets,
        factionRegistry: room.factionRegistry,
        playerId: clientObj.id,
      };

      const options = {
        rng: createSeededRng(Math.floor(Date.now() + Math.random() * 100000)),
        ...DEFAULT_GENERATIVE_OPTIONS,
      };

      generated = clientObj.missionManager.generateWorldMissions(
        planetName,
        world,
        options,
      );
    }

    if (
      generated.length === 0 &&
      typeof clientObj.missionManager.generateMissionsForPlanet === "function"
    ) {
      clientObj.missionManager.generateMissionsForPlanet(
        planetName,
        room.planets,
        room.factionRegistry,
        clientObj.id,
      );
    }
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
  if ((command === "attack" || command === "intercept") && msg.targetId) {
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
/**
 * Saves current outfitting configuration to a custom preset slot.
 * @param {Object} clientObj - The socket client connection object.
 * @param {number} presetIndex - Index of the preset to save (0, 1, or 2).
 * @param {string|null} [presetName=null] - Custom name for the preset.
 */
export function handlePresetSave(clientObj, presetIndex, presetName = null) {
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

  const name =
    typeof presetName === "string" && presetName.trim()
      ? presetName.trim()
      : `Preset Slot ${presetIndex + 1}`;

  clientObj.presets[presetIndex] = {
    name: name,
    outfits: [...clientObj.ship.outfits],
  };

  clientObj.send({
    type: "notification",
    message: `Saved Preset: "${name}"!`,
    style: "success",
  });
}

/**
 * Loads a custom preset configuration, enforcing transactions, slots, power constraints, and stock availability.
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

  const preset = clientObj.presets[presetIndex];
  const ship = clientObj.ship;
  const factionRegistry = room ? room.factionRegistry : null;
  const sectorId = room && room.sectorId ? room.sectorId : null;

  // Run comprehensive validation via LoadoutManager
  const check = canLoadPreset(
    ship,
    preset,
    targetPlanet,
    clientObj.id,
    factionRegistry,
    sectorId,
    DEFAULT_OUTFITS,
  );

  if (!check.allowed) {
    clientObj.send({
      type: "notification",
      message: check.reason,
      style: "error",
    });
    return;
  }

  const { netCreditsChange } = check.details;

  // Uninstall current equipped outfits
  const originalOutfits = [...ship.outfits];
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
      removeOutfitStats(ship, outfit);
    }
  }
  ship.outfits = [];

  // Install target preset outfits
  const targetPresetOutfits = getPresetOutfits(preset);
  for (const name of targetPresetOutfits) {
    ship.outfits.push(name);
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
      applyOutfitStats(ship, outfit);
    }
  }

  // Adjust player credits
  ship.credits += netCreditsChange;

  const presetNameText =
    typeof preset === "object" && preset.name
      ? `"${preset.name}"`
      : `${presetIndex + 1}`;

  clientObj.send({
    type: "notification",
    message: `Loaded Preset ${presetNameText}! Net Transaction: ${netCreditsChange >= 0 ? "+" : ""}${netCreditsChange.toLocaleString()} CR`,
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

/**
 * Handles the distress beacon trigger.
 * @param {Object} clientObj - The socket client connection object.
 * @param {Object} room - The Dynamic GameInstance room.
 */
export function handleDistressBeacon(clientObj, room) {
  if (!clientObj || !clientObj.ship || !room) return;

  const hasBeacon =
    clientObj.ship.outfits &&
    clientObj.ship.outfits.includes("Emergency Distress Beacon");
  if (!hasBeacon) {
    clientObj.send({
      type: "notification",
      message: "No Emergency Distress Beacon installed!",
      style: "error",
    });
    return;
  }

  let governingFaction = "Independents";
  for (const planet of room.planets) {
    if (
      planet.faction === "Federation" ||
      planet.faction === "Frontier League" ||
      planet.faction === "Pirates"
    ) {
      governingFaction = planet.faction;
      break;
    }
  }

  const standing = room.factionRegistry.getStanding(
    clientObj.id,
    governingFaction,
  );
  const roomLower = room.name.toLowerCase();
  const isRimPirateSector =
    governingFaction === "Pirates" ||
    /\bpirate\b/.test(roomLower) ||
    /\brim\b/.test(roomLower) ||
    /\brogue\b/.test(roomLower);
  const isAmbush = standing < 0 || isRimPirateSector;

  if (isAmbush) {
    // Spawn pirate ambush!
    const angle = Math.random() * Math.PI * 2;
    const dist = 800;
    const spawnPos = clientObj.ship.position.add(
      new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist),
    );

    const pirateShip = new Ship({
      name: "Rim Pirate Raider",
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 200,
      maxArmor: 150,
      thrustPower: 14000,
      turnRate: 3.0,
      weaponDamage: 20,
      weaponCooldown: 0.4,
    });
    pirateShip.role = "pirate";
    pirateShip.faction = "Pirates";

    const controller = new AIController(pirateShip, "pirate", {
      useUtilityAdvisor: true,
      factionPolicy: room.factionRegistry.factionPolicy(),
      standingPolicy: room.factionRegistry.standingPolicy(),
    });
    controller.target = clientObj.ship;

    room.engine.addEntity(pirateShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message:
        "Warning: Distress beacon signal intercepted! Hostile Rim Pirate Raider incoming!",
      style: "error",
    });
  } else {
    // Spawn allied rescue/refuel caravan!
    const angle = Math.random() * Math.PI * 2;
    const dist = 800;
    const spawnPos = clientObj.ship.position.add(
      new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist),
    );

    const factionName =
      governingFaction === "Independents" ? "Independent" : governingFaction;
    const tankerShip = new Ship({
      name: `${factionName} Refuel Tanker`,
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 350,
      maxArmor: 250,
      thrustPower: 12000,
      turnRate: 2.2,
      weaponDamage: 12,
      weaponCooldown: 0.5,
    });
    tankerShip.role = "merchant";
    tankerShip.faction = governingFaction;

    const controller = new AIController(tankerShip, "merchant", {
      useUtilityAdvisor: false,
      factionPolicy: room.factionRegistry.factionPolicy(),
      standingPolicy: room.factionRegistry.standingPolicy(),
    });
    controller.destination = clientObj.ship.position.clone();
    controller.isRefuelTanker = true;
    controller.refuelTargetId = clientObj.id;

    room.engine.addEntity(tankerShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `Distress beacon broadcasted. Allied ${factionName} Refuel Tanker scrambled to your coordinates!`,
      style: "success",
    });
  }
}
