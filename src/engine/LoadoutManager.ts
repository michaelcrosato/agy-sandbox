/**
 * LoadoutManager coordinates outfitting mass, ship agility scaling, power grid calculations, and presets.
 */
import { DEFAULT_OUTFITS } from "./outfitCatalog.js";
import { getOutfitCategory } from "./Outfitting.js";
import { getModifiedUpgradePrice, getTransactionTaxRate } from "./Trading.js";
import { checkUpgradeLockout } from "./PortServices.js";

/**
 * Mapping of ship outfit name strings to their virtual power grid draws in MW.
 * Reactor modules supply virtual grid power represented by negative values.
 * @type {Record<string, number>}
 */
export const OUTFIT_POWER_DRAWS = {
  "Basic Laser": 10,
  "Heavy Shields": 30,
  "Aegis Shield Matrix": 80,
  "Overcharged Engines": 20,
  "Hyper-Drive Thrusters": 40,
  "Plasma Cannon": 15,
  "Neutron Blaster": 25,
  "Ion Disruptor Array": 20,
  "Expanded Cargo Holds": 0,
  "Sub-space Cargo Compressor": 10,
  "Tractor Beam Matrix": 15,
  "Cold-Fusion Reactor": -30, // Supplies 30 MW power
  "Cryo-Cooling Radiator": 5,
  "Supercapacitor Cells": 0,
  "Ramscoop Collector": 10,
  "Auxiliary Fuel Cells": 0,
  "Mining Laser": 15,
  "Shielded Cargo Holds": 0,
  "Security Decoy Jammer": 10,
  "Bounty Locator Radar": 10,
  "Hyperdrive Interdictor Matrix": 50,
  "Emergency Distress Beacon": 0,
};

/**
 * Extracts standard list of outfits from a preset input (which can be a simple array or preset object).
 * @param {Array|Object} preset
 * @returns {Array<string>}
 */
export function getPresetOutfits(preset) {
  if (!preset) return [];
  if (Array.isArray(preset)) return preset;
  if (Array.isArray(preset.outfits)) return preset.outfits;
  return [];
}

/**
 * Validates slot availability, virtual power capacity, and max mass limits of a preset configuration on a ship.
 * @param {Object} ship
 * @param {Array|Object} preset
 * @param {ReadonlyArray<any>} [catalog=DEFAULT_OUTFITS]
 * @returns {{ allowed: boolean, reason: string }}
 */
export function validatePreset(ship, preset, catalog = DEFAULT_OUTFITS) {
  if (!ship) return { allowed: false, reason: "No ship provided" };
  const outfits = getPresetOutfits(preset);

  // 1. Slot validation
  let weapons = 0;
  let shields = 0;
  let utilities = 0;

  for (const name of outfits) {
    let cat = "general";
    if (name === "Basic Laser") {
      cat = "weapon";
    } else {
      const outfit = catalog.find((o) => o.name === name);
      if (outfit) {
        cat = getOutfitCategory(outfit.type);
      }
    }

    if (cat === "weapon") weapons++;
    else if (cat === "shield") shields++;
    else if (cat === "utility") utilities++;
  }

  if (weapons > 2) {
    return {
      allowed: false,
      reason: "Preset exceeds Weapon slots cap (Max 2)!",
    };
  }
  if (shields > 1) {
    return {
      allowed: false,
      reason: "Preset exceeds Shield slot cap (Max 1)!",
    };
  }
  if (utilities > 1) {
    return {
      allowed: false,
      reason: "Preset exceeds Utility slot cap (Max 1)!",
    };
  }

  // 2. Power Grid Capacity validation
  let totalPowerDraw = 0;
  for (const name of outfits) {
    const draw =
      OUTFIT_POWER_DRAWS[name] !== undefined ? OUTFIT_POWER_DRAWS[name] : 0;
    totalPowerDraw += draw;
  }

  const maxPower =
    ship.powerGridCapacity !== undefined ? ship.powerGridCapacity : 120;
  if (totalPowerDraw > maxPower) {
    return {
      allowed: false,
      reason: `Preset power draw (${totalPowerDraw} MW) exceeds ship capacity (${maxPower} MW)!`,
    };
  }

  // 3. Mass Limits validation
  let totalMass = 0;
  for (const name of outfits) {
    if (name === "Basic Laser") continue;
    const outfit = catalog.find((o) => o.name === name);
    if (outfit && outfit.mass) {
      totalMass += outfit.mass;
    }
  }

  const maxMass = ship.maxOutfitMass !== undefined ? ship.maxOutfitMass : 3000;
  if (totalMass > maxMass) {
    return {
      allowed: false,
      reason: `Preset mass (${totalMass} kg) exceeds ship outfit mass limit (${maxMass} kg)!`,
    };
  }

  return { allowed: true, reason: "" };
}

/**
 * Calculates total purchase and sell adjustments for outfits in a preset.
 * @param {Object} ship
 * @param {Array|Object} preset
 * @param {ReadonlyArray<any>} [catalog=DEFAULT_OUTFITS]
 * @param {string|null} playerId
 * @param {Object|null} factionRegistry
 * @param {string|null} planetFaction
 * @param {string|null} sectorId
 * @returns {{
 *   totalCost: number,
 *   totalRefund: number,
 *   netCreditsChange: number,
 *   toBuy: Array<string>,
 *   toSell: Array<string>
 * }}
 */
export function calculatePresetCost(
  ship,
  preset,
  catalog = DEFAULT_OUTFITS,
  playerId = null,
  factionRegistry = null,
  planetFaction = null,
  sectorId = null,
) {
  const outfits = getPresetOutfits(preset);
  const current = [...ship.outfits];
  const target = [...outfits];
  const toSell = [];

  // Identify matching items to keep, leaving only non-matching to buy/sell
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

  const taxRate = getTransactionTaxRate(
    factionRegistry,
    playerId,
    planetFaction,
    sectorId,
  );

  // Calculate buy cost
  let totalCost = 0;
  for (const name of toBuy) {
    let baseCost = 0;
    if (name !== "Basic Laser") {
      const outfit = catalog.find((o) => o.name === name);
      if (outfit) baseCost = outfit.cost;
    }
    const modifiedCost = getModifiedUpgradePrice(
      baseCost,
      factionRegistry,
      playerId,
      planetFaction,
    );
    // Apply dynamic tax surcharge on buy
    totalCost += Math.round(modifiedCost * (1 + taxRate));
  }

  // Calculate sell refund
  let totalRefund = 0;
  for (const name of toSell) {
    let baseCost = 0;
    if (name !== "Basic Laser") {
      const outfit = catalog.find((o) => o.name === name);
      if (outfit) baseCost = outfit.cost;
    }
    const modifiedCost = getModifiedUpgradePrice(
      baseCost,
      factionRegistry,
      playerId,
      planetFaction,
    );
    const refundBase = Math.floor(modifiedCost * 0.9);
    // Apply transaction tax deduction on sell
    totalRefund += Math.max(0, Math.round(refundBase * (1 - taxRate)));
  }

  const netCreditsChange = totalRefund - totalCost;

  return {
    totalCost,
    totalRefund,
    netCreditsChange,
    toBuy,
    toSell,
  };
}

/**
 * High-level check if player can load a preset (checking slot/power/mass safety, stock levels, rank constraints).
 * @param {Object} ship
 * @param {Array|Object} preset
 * @param {Object} planet
 * @param {string|null} playerId
 * @param {Object|null} factionRegistry
 * @param {string|null} sectorId
 * @param {ReadonlyArray<any>} [catalog=DEFAULT_OUTFITS]
 * @returns {{ allowed: boolean, reason: string, details?: Object }}
 */
export function canLoadPreset(
  ship,
  preset,
  planet,
  playerId = null,
  factionRegistry = null,
  sectorId = null,
  catalog = DEFAULT_OUTFITS,
) {
  // 1. Validate preset physical layout
  const val = validatePreset(ship, preset, catalog);
  if (!val.allowed) {
    return { allowed: false, reason: val.reason };
  }

  // 2. Calculate costs & buy/sell breakdown
  const details = calculatePresetCost(
    ship,
    preset,
    catalog,
    playerId,
    factionRegistry,
    planet ? planet.faction : null,
    sectorId,
  );

  // 3. Stock constraints check: items to buy must be sold in planet's outfitter
  if (planet && Array.isArray(planet.outfitter)) {
    for (const name of details.toBuy) {
      if (name === "Basic Laser") continue; // Basic Laser is always available
      const stockItem = planet.outfitter.find((o) => o.name === name);
      if (!stockItem) {
        return {
          allowed: false,
          reason: `Item "${name}" is out of stock / not sold at this planet!`,
          details,
        };
      }
    }
  }

  // 4. Rank lockout check
  if (planet) {
    for (const name of details.toBuy) {
      if (name === "Basic Laser") continue;
      const lockout = checkUpgradeLockout(
        name,
        factionRegistry,
        playerId,
        planet.faction,
        ship,
      );
      if (!lockout.allowed) {
        return {
          allowed: false,
          reason: `Rank Locked: "${name}" requires rank ${lockout.requiredRank}!`,
          details,
        };
      }
    }
  }

  // 5. Affordability check
  if (ship.credits + details.netCreditsChange < 0) {
    const costShortfall = -(ship.credits + details.netCreditsChange);
    return {
      allowed: false,
      reason: `Insufficient credits to load preset! Missing ${costShortfall.toLocaleString()} CR.`,
      details,
    };
  }

  return { allowed: true, reason: "", details };
}

/**
 * Calculates total ship mass (hull mass + active outfits mass) for a ship.
 * @param {Object} ship
 * @param {Array|Object} preset
 * @param {ReadonlyArray<any>} [catalog=DEFAULT_OUTFITS]
 * @returns {number} Total mass in kg.
 */
export function calculatePresetTotalMass(
  ship,
  preset,
  catalog = DEFAULT_OUTFITS,
) {
  if (!ship) return 0;
  const hullMass = ship.hullMass !== undefined ? ship.hullMass : 2000;
  const outfitMass = calculatePresetOutfitMass(preset, catalog);
  return hullMass + outfitMass;
}

/**
 * Calculates total outfit mass for a given preset setup.
 * @param {Array|Object} preset
 * @param {ReadonlyArray<any>} [catalog=DEFAULT_OUTFITS]
 * @returns {number} Outfit mass in kg.
 */
export function calculatePresetOutfitMass(preset, catalog = DEFAULT_OUTFITS) {
  const outfits = getPresetOutfits(preset);
  let outfitMass = 0;
  for (const name of outfits) {
    if (name === "Basic Laser") continue;
    const outfit = catalog.find((o) => o.name === name);
    if (outfit && outfit.mass) {
      outfitMass += outfit.mass;
    }
  }
  return outfitMass;
}
