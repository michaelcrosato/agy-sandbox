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
 * Calculates the transaction tax rate based on player faction standing.
 * @param {Object|null} registry - FactionRegistry instance.
 * @param {string} playerId - Player ID.
 * @param {string|null} faction - Faction name.
 * @returns {number} The tax rate (0.0, 0.05, or 0.15).
 */
export function getTransactionTaxRate(registry, playerId, faction) {
  if (
    !registry ||
    !faction ||
    faction === "Independents" ||
    typeof registry.getStanding !== "function"
  ) {
    return 0.0;
  }
  const standing = registry.getStanding(playerId, faction);
  if (standing >= 50) return 0.0; // Allied/Friendly
  if (standing <= -16) return 0.15; // Hostile
  return 0.05; // Neutral
}

/**
 * Calculates the standing-adjusted price for hulls and outfits.
 * @param {number} baseCost - Base cost of the hull/outfit.
 * @param {Object|null} registry - FactionRegistry instance.
 * @param {string} playerId - Player ID.
 * @param {string|null} faction - Controlling faction name.
 * @returns {number} The standing-adjusted price.
 */
export function getModifiedUpgradePrice(baseCost, registry, playerId, faction) {
  if (
    !registry ||
    !faction ||
    faction === "Independents" ||
    typeof registry.getStanding !== "function"
  ) {
    return baseCost;
  }
  const standing = registry.getStanding(playerId, faction);
  if (standing >= 50) {
    return Math.max(1, Math.round(baseCost * 0.85)); // 15% discount
  }
  if (standing <= -16) {
    return Math.max(1, Math.round(baseCost * 1.2)); // 20% surcharge
  }
  return baseCost; // Neutral
}

/**
 * Applies a shipyard hull purchase: charges the cost, swaps the hull stats, and
 * resets the cargo hold. No-op (insufficient_credits) if the ship can't afford it.
 * @param {Object} ship - Ship-like (mutated on success).
 * @param {Object} hull - Shipyard entry `{ name, cost, maxShield, maxArmor, cargoCapacity, thrustPower, turnRate }`.
 * @param {number|null} [costOverride] - Optional standing-adjusted cost to charge.
 * @returns {{ok: boolean, reason: string}}
 */
export function applyHullPurchase(ship, hull, costOverride = null) {
  if (!ship || !hull) return { ok: false, reason: "invalid" };
  const cost = Number.isFinite(costOverride) ? costOverride : hull.cost;
  if (!Number.isFinite(ship.credits) || ship.credits < cost) {
    return { ok: false, reason: "insufficient_credits" };
  }
  ship.credits -= cost;
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

/**
 * Finds the top 3 most profitable trade routes among a list of planets,
 * factoring in player faction standings price modifiers and transaction taxes.
 * @param {Array<Object>} planets - List of docked planets in the active sector.
 * @param {Object|null} registry - FactionRegistry instance.
 * @param {string} playerId - Player ID.
 * @returns {Array<{commodity: string, origin: string, destination: string, buyPrice: number, sellPrice: number, netProfit: number}>}
 */
export function findBestTradeRoutes(planets, registry, playerId) {
  if (!Array.isArray(planets) || planets.length < 2) return [];
  const routes = [];
  const commodities = [
    "food",
    "electronics",
    "minerals",
    "luxuries",
    "contraband",
    "machinery",
    "ore",
  ];

  for (let i = 0; i < planets.length; i++) {
    const pA = planets[i];
    for (let j = 0; j < planets.length; j++) {
      if (i === j) continue;
      const pB = planets[j];

      for (const commodity of commodities) {
        let baseBuyPrice = pA.market[commodity];
        let baseSellPrice = pB.market[commodity];
        if (baseBuyPrice === undefined || baseSellPrice === undefined) continue;

        // Apply black market sell premium for contraband if applicable
        if (
          commodity === "contraband" &&
          pB.services &&
          pB.services.blackMarket
        ) {
          baseSellPrice = Math.round(baseSellPrice * 1.5);
        }

        // Apply standings price modifiers
        const buyPrice = factionPrice(
          baseBuyPrice,
          registry,
          playerId,
          pA.faction,
          "buy",
        );
        const sellPrice = factionPrice(
          baseSellPrice,
          registry,
          playerId,
          pB.faction,
          "sell",
        );

        // Deduct transaction tax from sale
        const taxRate = getTransactionTaxRate(registry, playerId, pB.faction);
        const netSellPrice = Math.max(1, Math.round(sellPrice * (1 - taxRate)));

        const netProfit = netSellPrice - buyPrice;
        if (netProfit > 0) {
          routes.push({
            commodity,
            origin: pA.name,
            destination: pB.name,
            buyPrice,
            sellPrice: netSellPrice,
            netProfit,
          });
        }
      }
    }
  }

  // Sort routes by net profit descending
  routes.sort((a, b) => b.netProfit - a.netProfit);
  return routes.slice(0, 3);
}
