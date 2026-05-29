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
