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
