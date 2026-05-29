/**
 * Outfitting (spec 007) — pure application of an outfit's stat effects onto a
 * ship. Extracted verbatim from the server's `outfit_buy` handler so the
 * type→stat mapping is unit-testable instead of buried in a 2,000-line socket
 * file. Mutates the ship; returns whether a known outfit type was applied.
 */

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
