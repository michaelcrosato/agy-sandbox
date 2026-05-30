/**
 * PortServices (EW5) — pure helpers for paid hull repair and hyperdrive refuel at
 * a port. Cost scales with the deficit; applying restores to max, charges the
 * ship's credits, and clamps. Insufficient credits is a no-op (full-or-nothing).
 *
 * Shields and heat already self-recover in `Ship.update`, so repair targets the
 * persistent damage: structural `armor`. Refuel tops off `hyperFuel`.
 *
 * No DOM, sockets, timers, or `Math.random`. Functions mutate only the ship
 * passed to `applyRepair` / `applyRefuel`.
 */

/** Default port pricing. Frozen; override per-call. */
export const DEFAULT_PORT_SERVICE_OPTIONS = Object.freeze({
  repairCostPerPoint: 5, // credits per point of armor restored
  refuelCostPerUnit: 8, // credits per unit of hyperFuel restored
});

/**
 * Missing armor (>= 0).
 * @param {Object} ship - Ship-like with `armor`, `maxArmor`.
 * @returns {number}
 */
export function armorDeficit(ship) {
  if (!ship) return 0;
  const max = Number.isFinite(ship.maxArmor) ? ship.maxArmor : 0;
  const cur = Number.isFinite(ship.armor) ? ship.armor : 0;
  return Math.max(0, max - cur);
}

/**
 * Missing hyperdrive fuel (>= 0).
 * @param {Object} ship - Ship-like with `hyperFuel`, `maxHyperFuel`.
 * @returns {number}
 */
export function fuelDeficit(ship) {
  if (!ship) return 0;
  const max = Number.isFinite(ship.maxHyperFuel) ? ship.maxHyperFuel : 0;
  const cur = Number.isFinite(ship.hyperFuel) ? ship.hyperFuel : 0;
  return Math.max(0, max - cur);
}

/**
 * Credit cost to fully repair the ship's armor.
 * @param {Object} ship
 * @param {Object} [options] - Partial override of {@link DEFAULT_PORT_SERVICE_OPTIONS}.
 * @returns {number} Non-negative integer cost.
 */
export function repairCost(ship, options = {}) {
  const o = { ...DEFAULT_PORT_SERVICE_OPTIONS, ...options };
  return Math.ceil(armorDeficit(ship) * o.repairCostPerPoint);
}

/**
 * Credit cost to fully refuel the ship's hyperdrive.
 * @param {Object} ship
 * @param {Object} [options] - Partial override of {@link DEFAULT_PORT_SERVICE_OPTIONS}.
 * @returns {number} Non-negative integer cost.
 */
export function refuelCost(ship, options = {}) {
  const o = { ...DEFAULT_PORT_SERVICE_OPTIONS, ...options };
  return Math.ceil(fuelDeficit(ship) * o.refuelCostPerUnit);
}

/**
 * Fully repairs armor if the ship can afford it; otherwise a no-op.
 * @param {Object} ship - Mutated on success (`armor`, `credits`).
 * @param {Object} [options]
 * @returns {{repaired: number, cost: number, ok: boolean}}
 */
export function applyRepair(ship, options = {}) {
  if (!ship) return { repaired: 0, cost: 0, ok: false };
  const deficit = armorDeficit(ship);
  if (deficit <= 0) return { repaired: 0, cost: 0, ok: false };
  const cost = repairCost(ship, options);
  if (!Number.isFinite(ship.credits) || ship.credits < cost) {
    return { repaired: 0, cost, ok: false };
  }
  ship.armor = ship.maxArmor;
  ship.credits -= cost;
  return { repaired: deficit, cost, ok: true };
}

/**
 * Fully refuels the hyperdrive if the ship can afford it; otherwise a no-op.
 * @param {Object} ship - Mutated on success (`hyperFuel`, `credits`).
 * @param {Object} [options]
 * @returns {{refueled: number, cost: number, ok: boolean}}
 */
export function applyRefuel(ship, options = {}) {
  if (!ship) return { refueled: 0, cost: 0, ok: false };
  const deficit = fuelDeficit(ship);
  if (deficit <= 0) return { refueled: 0, cost: 0, ok: false };
  const cost = refuelCost(ship, options);
  if (!Number.isFinite(ship.credits) || ship.credits < cost) {
    return { refueled: 0, cost, ok: false };
  }
  ship.hyperFuel = ship.maxHyperFuel;
  ship.credits -= cost;
  return { refueled: deficit, cost, ok: true };
}

/**
 * Credit cost to refine a quantity of raw ore.
 * @param {number} quantity - Quantity of raw ore to refine.
 * @param {Object} [options] - Options with baseFeePerOre.
 * @param {Object|null} [registry] - FactionRegistry instance.
 * @param {string|null} [playerId] - The player's ID.
 * @param {string|null} [faction] - The planet's faction.
 * @returns {number} Non-negative integer cost.
 */
export function refineCost(
  quantity,
  options = {},
  registry = null,
  playerId = null,
  faction = null,
) {
  const baseFee =
    options.baseFeePerOre !== undefined ? options.baseFeePerOre : 10;
  let feeRate = baseFee;
  if (registry && faction && playerId != null) {
    feeRate = feeRate * registry.priceModifier(playerId, faction, "buy");
  }
  return Math.max(0, Math.ceil(quantity * feeRate));
}

/**
 * Manually refines raw ore carried in ship cargo into minerals or machinery.
 *
 * Ratio:
 * - ore -> minerals: 2:1
 * - ore -> machinery: 4:1 (or as configured)
 *
 * @param {Object} ship - The ship being modified.
 * @param {Object} planet - The docked planet.
 * @param {number} quantity - Quantity of raw 'ore' to refine.
 * @param {Object} [options] - Pricing and ratio options.
 * @param {Object|null} [registry] - FactionRegistry instance.
 * @param {string|null} [playerId] - The player's ID.
 * @param {string} [targetCommodity="minerals"] - The target refined commodity.
 * @returns {{ok: boolean, reason: string, refined: number, produced: number, cost: number}}
 */
export function applyRefine(
  ship,
  planet,
  quantity,
  options = {},
  registry = null,
  playerId = null,
  targetCommodity = "minerals",
) {
  if (!ship || !planet) {
    return { ok: false, reason: "invalid", refined: 0, produced: 0, cost: 0 };
  }

  // Verify planet has refinery services
  if (!planet.services || !planet.services.refinery) {
    return {
      ok: false,
      reason: "no_refinery_services",
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  // Validate target commodity is valid
  if (targetCommodity !== "minerals" && targetCommodity !== "machinery") {
    return {
      ok: false,
      reason: "invalid_target_commodity",
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  // Check quantity is positive and integer
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      reason: "invalid_quantity",
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  // Determine ratio and base fee
  const defaultOpts = {
    oreToMineralsRatio: 2,
    oreToMachineryRatio: 4,
    baseFeePerOre: 10,
  };
  const o = { ...defaultOpts, ...options };

  const ratio =
    targetCommodity === "minerals"
      ? o.oreToMineralsRatio
      : o.oreToMachineryRatio;

  // Check that the quantity is a multiple of the ratio
  if (quantity % ratio !== 0) {
    return {
      ok: false,
      reason: `quantity_must_be_multiple_of_${ratio}`,
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  // Check if ship has enough raw ore
  const currentOre = (ship.cargo && ship.cargo.ore) || 0;
  if (currentOre < quantity) {
    return {
      ok: false,
      reason: "insufficient_ore",
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  // Calculate fee
  const cost = refineCost(quantity, o, registry, playerId, planet.faction);

  // Check if ship has enough credits
  if (!Number.isFinite(ship.credits) || ship.credits < cost) {
    return {
      ok: false,
      reason: "insufficient_credits",
      refined: 0,
      produced: 0,
      cost,
    };
  }

  const producedQty = quantity / ratio;

  // Execute cargo transaction
  const removed = ship.removeCargo("ore", quantity);
  if (!removed) {
    return {
      ok: false,
      reason: "insufficient_ore",
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  const added = ship.addCargo(targetCommodity, producedQty);
  if (!added) {
    // Rollback
    ship.addCargo("ore", quantity);
    return {
      ok: false,
      reason: "cargo_full",
      refined: 0,
      produced: 0,
      cost: 0,
    };
  }

  // Deduct fee
  ship.credits -= cost;

  return {
    ok: true,
    reason: "refined",
    refined: quantity,
    produced: producedQty,
    cost,
  };
}

/**
 * Calculates player's Naval Rank based on their numeric faction standing.
 * @param {number} standing - Faction standing value.
 * @returns {string} One of: "OUTLAW" | "RECRUIT" | "LIEUTENANT" | "COMMANDER" | "ADMIRAL".
 */
export function getNavalRank(standing) {
  if (standing <= -10) return "OUTLAW";
  if (standing < 10) return "RECRUIT";
  if (standing < 40) return "LIEUTENANT";
  if (standing < 80) return "COMMANDER";
  return "ADMIRAL";
}

/**
 * Redeems player's collected bounty vouchers for the given faction (or all factions if null/all).
 * Awards credits (plus allied/friendly multiplier) and dynamic standing points.
 *
 * @param {Object} ship - Ship object to mutate (credits, bountyVouchers).
 * @param {string|null} faction - Specific faction to redeem, or null/"all" for all.
 * @param {Object|null} factionRegistry - The FactionRegistry instance to update standing.
 * @param {string|null} playerId - The ID of the player to adjust standing for.
 * @returns {Object} `{ ok: boolean, reason: string, creditsClaimed: number, reputationGained: number, count: number }`
 */
export function redeemFactionVouchers(
  ship,
  faction,
  factionRegistry,
  playerId,
) {
  if (!ship)
    return {
      ok: false,
      reason: "invalid_ship",
      creditsClaimed: 0,
      reputationGained: 0,
      count: 0,
    };
  if (!ship.bountyVouchers || ship.bountyVouchers.length === 0) {
    return {
      ok: false,
      reason: "no_vouchers",
      creditsClaimed: 0,
      reputationGained: 0,
      count: 0,
    };
  }

  const targetFaction = faction === "all" ? null : faction;

  const toRedeem = [];
  const toKeep = [];

  for (const v of ship.bountyVouchers) {
    if (!targetFaction || v.faction === targetFaction) {
      toRedeem.push(v);
    } else {
      toKeep.push(v);
    }
  }

  if (toRedeem.length === 0) {
    return {
      ok: false,
      reason: "no_matching_vouchers",
      creditsClaimed: 0,
      reputationGained: 0,
      count: 0,
    };
  }

  // Calculate base credits and standing increments
  let baseCredits = 0;
  const factionTotals = {};

  for (const v of toRedeem) {
    baseCredits += v.value || 0;
    const f = v.faction || "Independents";
    factionTotals[f] = (factionTotals[f] || 0) + (v.value || 0);
  }

  // Calculate dynamic standing/reputation adjustments (1 point per 1000 CR value)
  let totalReputationGained = 0;
  if (factionRegistry && playerId) {
    for (const [f, totalValue] of Object.entries(factionTotals)) {
      const repDelta = Math.max(0.5, totalValue / 1000);
      factionRegistry.adjustStanding(playerId, f, repDelta);
      totalReputationGained += repDelta;
    }
  }

  // Calculate credit standing bonus: friendly/allied standing grants 15% Naval Commendation credit bonus!
  let standing = 0;
  const governingFaction =
    targetFaction || toRedeem[0].faction || "Independents";
  if (factionRegistry && playerId) {
    standing = factionRegistry.getStanding(playerId, governingFaction);
  }
  const isFriendly = standing >= 10;
  const multiplier = isFriendly ? 1.15 : 1.0;
  const creditsClaimed = Math.round(baseCredits * multiplier);

  // Apply to ship
  ship.credits = (ship.credits || 0) + creditsClaimed;
  ship.bountyVouchers = toKeep;

  return {
    ok: true,
    reason: "redeemed",
    creditsClaimed,
    reputationGained: totalReputationGained,
    count: toRedeem.length,
  };
}

/**
 * Checks if purchase of a hull or outfit is blocked due to rank requirements.
 *
 * @param {string} itemName - Name of hull or outfit upgrade.
 * @param {Object|null} factionRegistry - FactionRegistry instance.
 * @param {string|null} playerId - Player ID.
 * @param {string|null} faction - Governing planet faction.
 * @returns {Object} `{ allowed: boolean, requiredRank: string, currentRank: string }`
 */
export function checkUpgradeLockout(
  itemName,
  factionRegistry,
  playerId,
  faction,
  playerShip = null,
) {
  let requiredRank = "RECRUIT";
  if (itemName === "Interceptor") {
    requiredRank = "LIEUTENANT";
  } else if (itemName === "Military Destroyer") {
    requiredRank = "COMMANDER";
  } else if (itemName === "Ion Disruptor Array") {
    requiredRank = "LIEUTENANT";
  }

  if (requiredRank === "RECRUIT") {
    return { allowed: true, requiredRank, currentRank: "RECRUIT" };
  }

  let currentRank;
  if (
    playerShip &&
    playerShip.navalRank &&
    faction &&
    playerShip.navalRank[faction]
  ) {
    currentRank = playerShip.navalRank[faction].toUpperCase();
  } else {
    let standing = 0;
    if (factionRegistry && playerId && faction) {
      standing = factionRegistry.getStanding(playerId, faction);
    }
    currentRank = getNavalRank(standing);
  }

  // Rank hierarchy priority value for comparison
  const rankPriority = {
    OUTLAW: -1,
    RECRUIT: 0,
    ENSIGN: 1,
    LIEUTENANT: 2,
    COMMANDER: 3,
    ADMIRAL: 4,
  };

  const hasRank =
    (rankPriority[currentRank] || 0) >= (rankPriority[requiredRank] || 0);

  return {
    allowed: hasRank,
    requiredRank,
    currentRank,
  };
}
