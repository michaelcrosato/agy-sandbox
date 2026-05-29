/**
 * statsPayload (spec 007) — builds the per-client `stats` message from a live
 * client object. Extracted from the server's `sendStats` so the payload shape is
 * a pure, testable function of the ship + mission manager rather than inline in
 * the socket layer.
 */

/**
 * @param {Object} clientObj - `{ ship, missionManager }`.
 * @returns {Object|null} The `stats` message, or null when there is no ship.
 */
export function buildStatsPayload(clientObj) {
  const ship = clientObj && clientObj.ship;
  if (!ship) return null;
  return {
    type: "stats",
    credits: ship.credits,
    cargo: ship.cargo,
    shield: ship.shield,
    maxShield: ship.maxShield,
    armor: ship.armor,
    maxArmor: ship.maxArmor,
    name: ship.name,
    outfits: ship.outfits,
    cargoCapacity: ship.cargoCapacity,
    thrustPower: ship.thrustPower,
    turnRate: ship.turnRate,
    weaponDamage: ship.weaponDamage,
    activeMissions: clientObj.missionManager
      ? clientObj.missionManager.activeMissions
      : [],
    energy: ship.energy,
    maxEnergy: ship.maxEnergy,
    heat: ship.heat,
    maxHeat: ship.maxHeat,
    hyperFuel: ship.hyperFuel,
    maxHyperFuel: ship.maxHyperFuel,
    isOverheated: ship.isOverheated,
    isDisabled: ship.isDisabled,
    kills: ship.kills,
    combatRating: ship.combatRating,
  };
}
