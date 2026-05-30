/**
 * Trading (spec 025) — pure decision/mutation cores extracted from the server's
 * `trade` and `ship_buy` message handlers, so the credit/cargo/hull math is
 * unit-testable instead of inline in the socket file. Each returns a
 * `{ ok, reason }` result; the server keeps the market side-effects (registerBuy/
 * Sell), notifications, and broadcasts. Mutates only the ship passed in.
 */

/**
 * Buys or sells one ton of `item` at `price`, mutating the ship's credits/cargo.
 * @param {Object} ship - Ship-like with `credits`, `addCargo`, `removeCargo`.
 * @param {string} item - Commodity.
 * @param {"buy"|"sell"} action
 * @param {number} price - Unit price (from the planet market).
 * @returns {{ok: boolean, reason: string}} reason ∈ bought|sold|insufficient_credits|cargo_full|no_cargo|invalid|unknown_action
 */
export function tradeOne(ship, item, action, price) {
  if (!ship || !Number.isFinite(price)) return { ok: false, reason: "invalid" };
  if (action === "buy") {
    if (!Number.isFinite(ship.credits) || ship.credits < price) {
      return { ok: false, reason: "insufficient_credits" };
    }
    if (!ship.addCargo(item, 1)) return { ok: false, reason: "cargo_full" };
    ship.credits -= price;
    return { ok: true, reason: "bought" };
  }
  if (action === "sell") {
    if (!ship.removeCargo(item, 1)) return { ok: false, reason: "no_cargo" };
    ship.credits += price;
    return { ok: true, reason: "sold" };
  }
  return { ok: false, reason: "unknown_action" };
}

/**
 * Applies a shipyard hull purchase: charges the cost, swaps the hull stats, and
 * resets the cargo hold. No-op (insufficient_credits) if the ship can't afford it.
 * @param {Object} ship - Ship-like (mutated on success).
 * @param {Object} hull - Shipyard entry `{ name, cost, maxShield, maxArmor, cargoCapacity, thrustPower, turnRate }`.
 * @returns {{ok: boolean, reason: string}}
 */
export function applyHullPurchase(ship, hull) {
  if (!ship || !hull) return { ok: false, reason: "invalid" };
  if (!Number.isFinite(ship.credits) || ship.credits < hull.cost) {
    return { ok: false, reason: "insufficient_credits" };
  }
  ship.credits -= hull.cost;
  ship.name = hull.name;
  ship.maxShield = hull.maxShield;
  ship.shield = hull.maxShield;
  ship.maxArmor = hull.maxArmor;
  ship.armor = hull.maxArmor;
  ship.cargoCapacity = hull.cargoCapacity;
  ship.thrustPower = hull.thrustPower;
  ship.turnRate = hull.turnRate;
  ship.cargo = {
    food: 0,
    electronics: 0,
    minerals: 0,
    luxuries: 0,
    contraband: 0,
    machinery: 0,
  };
  return { ok: true, reason: "purchased" };
}
