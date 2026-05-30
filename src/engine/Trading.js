/**
 * Trading (spec 025) — pure decision/mutation cores extracted from the server's
 * `trade` and `ship_buy` message handlers, so the credit/cargo/hull math is
 * unit-testable instead of inline in the socket file. Each returns a
 * `{ ok, reason }` result; the server keeps the market side-effects (registerBuy/
 * Sell), notifications, and broadcasts. Mutates only the ship passed in.
 */

import { makeEmptyCargo } from "./commodities.js";

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
 * Applies a faction price modifier to a base market price (spec 016). Friendly
 * standings discount buys / raise sells; hostile standings do the inverse. A
 * missing registry or planet faction is a no-op (returns the base price), so the
 * trade path is byte-identical where factions aren't configured.
 * @param {number} basePrice - The planet market unit price.
 * @param {Object|null} registry - FactionRegistry-like exposing
 *   `priceModifier(playerId, faction, mode)`.
 * @param {string} playerId - The trading player's id.
 * @param {string|null} faction - The planet's controlling faction.
 * @param {"buy"|"sell"} [mode="buy"]
 * @returns {number} The adjusted price, rounded and floored at 1.
 */
export function factionPrice(
  basePrice,
  registry,
  playerId,
  faction,
  mode = "buy",
) {
  if (
    !Number.isFinite(basePrice) ||
    !registry ||
    !faction ||
    typeof registry.priceModifier !== "function"
  ) {
    return basePrice;
  }
  const adjusted = basePrice * registry.priceModifier(playerId, faction, mode);
  if (!Number.isFinite(adjusted)) return basePrice;
  return Math.max(1, Math.round(adjusted));
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
  ship.cargo = makeEmptyCargo();
  return { ok: true, reason: "purchased" };
}
