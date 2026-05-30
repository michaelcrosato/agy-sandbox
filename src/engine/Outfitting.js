/**
 * Outfitting (spec 007) — pure application of an outfit's stat effects onto a
 * ship. Extracted verbatim from the server's `outfit_buy` handler so the
 * type→stat mapping is unit-testable instead of buried in a 2,000-line socket
 * file. Mutates the ship; returns whether a known outfit type was applied.
 */

import { DEFAULT_OUTFITS } from "./outfitCatalog.js";

/**
 * Applies an outfit's stat bonuses (and physical mass) to a ship.
 * @param {Object} ship - Ship to mutate. Must expose the relevant stat fields
 *   and `addOutfitMass`.
 * @param {Object} outfit - `{ type, value, mass? }` catalogue entry.
 * @returns {boolean} True if a known outfit type was applied; false otherwise.
 */
export function applyOutfitStats(ship, outfit) {
  if (!ship || !outfit) return false;

  let applied = true;
  switch (outfit.type) {
    case "shield":
      ship.maxShield += outfit.value;
      ship.shield = ship.maxShield;
      break;
    case "engine":
      ship.thrustPower += outfit.value;
      ship.maxSpeed += 50;
      break;
    case "weapon":
      ship.weaponDamage += outfit.value;
      break;
    case "pierce":
      ship.weaponShieldPierce = Math.min(
        1,
        (ship.weaponShieldPierce || 0) + outfit.value,
      );
      break;
    case "cargo":
      ship.cargoCapacity += outfit.value;
      break;
    case "reactor":
      ship.energyRegen += outfit.value;
      break;
    case "radiator":
      ship.heatDissipation += outfit.value;
      break;
    case "capacitor":
      ship.maxEnergy += outfit.value;
      ship.energy = ship.maxEnergy;
      break;
    case "ramscoop":
      ship.ramscoopRate = (ship.ramscoopRate || 0) + outfit.value;
      break;
    case "fuel":
      ship.maxHyperFuel += outfit.value;
      ship.hyperFuel = ship.maxHyperFuel;
      break;
    case "miner":
      ship.miningYieldMultiplier =
        (ship.miningYieldMultiplier || 1) + outfit.value;
      break;
    case "tractor":
      // No direct ship stats to mutate, but recognized as a valid outfit type so mass is added
      break;
    case "jammer":
      // No direct ship stats to mutate, but recognized as a valid outfit type so mass is added
      break;
    case "radar":
      // No direct ship stats to mutate, but recognized as a valid outfit type so mass is added
      break;
    case "interdictor":
      // No direct ship stats to mutate, but recognized as a valid outfit type so mass is added
      break;
    default:
      applied = false;
  }

  // Bolt the outfit's physical mass onto the hull so handling is the tradeoff
  // for the stat gains (heavier ships accelerate and turn slower).
  if (applied && outfit.mass && typeof ship.addOutfitMass === "function") {
    ship.addOutfitMass(outfit.mass);
  }
  return applied;
}

/**
 * Removes an outfit's stat bonuses (and physical mass) from a ship.
 * @param {Object} ship - Ship to mutate. Must expose the relevant stat fields
 *   and `removeOutfitMass`.
 * @param {Object} outfit - `{ type, value, mass? }` catalogue entry.
 * @returns {boolean} True if a known outfit type was removed; false otherwise.
 */
export function removeOutfitStats(ship, outfit) {
  if (!ship || !outfit) return false;

  let applied = true;
  switch (outfit.type) {
    case "shield":
      ship.maxShield = Math.max(1, ship.maxShield - outfit.value);
      ship.shield = Math.min(ship.shield, ship.maxShield);
      break;
    case "engine":
      ship.thrustPower = Math.max(0, ship.thrustPower - outfit.value);
      ship.maxSpeed = Math.max(0, ship.maxSpeed - 50);
      break;
    case "weapon":
      ship.weaponDamage = Math.max(0, ship.weaponDamage - outfit.value);
      break;
    case "pierce":
      ship.weaponShieldPierce = Math.max(
        0,
        (ship.weaponShieldPierce || 0) - outfit.value,
      );
      break;
    case "cargo":
      ship.cargoCapacity = Math.max(0, ship.cargoCapacity - outfit.value);
      break;
    case "reactor":
      ship.energyRegen = Math.max(0, ship.energyRegen - outfit.value);
      break;
    case "radiator":
      ship.heatDissipation = Math.max(0, ship.heatDissipation - outfit.value);
      break;
    case "capacitor":
      ship.maxEnergy = Math.max(1, ship.maxEnergy - outfit.value);
      ship.energy = Math.min(ship.energy, ship.maxEnergy);
      break;
    case "ramscoop":
      ship.ramscoopRate = Math.max(0, (ship.ramscoopRate || 0) - outfit.value);
      break;
    case "fuel":
      ship.maxHyperFuel = Math.max(0, ship.maxHyperFuel - outfit.value);
      ship.hyperFuel = Math.min(ship.hyperFuel, ship.maxHyperFuel);
      break;
    case "miner":
      ship.miningYieldMultiplier = Math.max(
        1,
        (ship.miningYieldMultiplier || 1) - outfit.value,
      );
      break;
    case "tractor":
      break;
    case "jammer":
      break;
    case "radar":
      break;
    case "interdictor":
      break;
    default:
      applied = false;
  }

  if (applied && outfit.mass && typeof ship.removeOutfitMass === "function") {
    ship.removeOutfitMass(outfit.mass);
  }
  return applied;
}

/**
 * Classifies an outfit's category by type.
 * @param {string} type
 * @returns {'weapon'|'shield'|'utility'|'general'}
 */
export function getOutfitCategory(type) {
  if (type === "weapon" || type === "pierce" || type === "miner")
    return "weapon";
  if (type === "shield") return "shield";
  if (
    type === "tractor" ||
    type === "jammer" ||
    type === "radar" ||
    type === "interdictor"
  ) {
    return "utility";
  }
  return "general";
}

/**
 * Validates if a ship has an available slot to purchase/install the given outfit.
 * @param {Object} ship - Ship to inspect. Must expose `outfits` (array of string names).
 * @param {Object} outfit - Catalogue entry under evaluation.
 * @param {ReadonlyArray<Object>} [catalog=DEFAULT_OUTFITS] - The outfit catalogue array to resolve names to categories.
 * @returns {{ allowed: boolean, reason: string }}
 */
export function validateSlotAvailability(
  ship,
  outfit,
  catalog = DEFAULT_OUTFITS,
) {
  if (!ship || !outfit) return { allowed: false, reason: "invalid" };

  const category = getOutfitCategory(outfit.type);
  if (category === "general") {
    return { allowed: true, reason: "" };
  }

  // Count existing items in this category currently equipped on the ship
  let equippedCount = 0;
  for (const name of ship.outfits) {
    if (name === "Basic Laser") {
      if (category === "weapon") equippedCount++;
      continue;
    }
    const match = catalog.find((o) => o.name === name);
    if (match && getOutfitCategory(match.type) === category) {
      equippedCount++;
    }
  }

  if (category === "weapon" && equippedCount >= 2) {
    return { allowed: false, reason: "Weapon slots full (Max: 2)!" };
  }
  if (category === "shield" && equippedCount >= 1) {
    return { allowed: false, reason: "Shield slot full (Max: 1)!" };
  }
  if (category === "utility" && equippedCount >= 1) {
    return { allowed: false, reason: "Utility slot full (Max: 1)!" };
  }

  return { allowed: true, reason: "" };
}
