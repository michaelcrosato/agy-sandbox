/**
 * WeaponArchetypes: pure data model of unified weapon archetypes.
 *
 * Every weapon in the game shares one physical lifecycle — a `Projectile`
 * fired by `SpaceEngine.fireWeapon`. Archetypes are tuning profiles that
 * scale a ship's base weapon stats (damage, speed, range, cooldown) and
 * set its shield-pierce fraction and per-shot energy/heat costs. Picking
 * an archetype is a build-tradeoff knob; the simulation itself stays
 * stat-driven so the client doesn't need to know about archetypes at all.
 *
 * Backward compatibility: a ship with no archetype keeps its existing
 * stats and uses the legacy 6-energy / 8-heat per-shot cost. The engine
 * already reads `weaponDamage` / `weaponRange` / `weaponSpeed` /
 * `weaponCooldown` / `weaponShieldPierce` off the ship, so applying an
 * archetype simply rewrites those fields in place.
 *
 * The five archetypes:
 *  - KINETIC: cheap, fast, low damage, no shield pierce, snappy cooldown.
 *  - ENERGY:  balanced baseline, modest shield pierce, standard heat.
 *  - BEAM:    near-instant short-range hits, high damage per shot, but
 *             long cooldown and severe heat — modeled as a very fast,
 *             short-lived projectile so no client lifecycle changes.
 *  - MISSILE: slow, long-range, heavy damage, strong shield pierce,
 *             long cooldown, expensive in energy.
 *  - FLAK:    rapid-fire, very short range, low damage, no pierce — a
 *             cheap point-defense / swarm weapon. Cheapest heat per shot.
 */

/**
 * Stable identifiers for the four supported archetypes. Frozen so the
 * set is immutable and safe to use as object keys / switch cases.
 * @type {Readonly<{KINETIC: string, ENERGY: string, BEAM: string, MISSILE: string}>}
 */
export const WeaponArchetype = Object.freeze({
  KINETIC: "KINETIC",
  ENERGY: "ENERGY",
  BEAM: "BEAM",
  MISSILE: "MISSILE",
  FLAK: "FLAK",
});

/**
 * Canonical order — useful for deterministic iteration in tests, UIs, and
 * any consumer that wants a stable archetype list without re-deriving one.
 * @type {ReadonlyArray<string>}
 */
export const WEAPON_ARCHETYPE_ORDER = Object.freeze([
  WeaponArchetype.KINETIC,
  WeaponArchetype.ENERGY,
  WeaponArchetype.BEAM,
  WeaponArchetype.MISSILE,
  WeaponArchetype.FLAK,
]);

/**
 * Per-archetype tuning profile. Scales are multiplicative against a ship's
 * existing base weapon stats so the same archetype tunes a frigate's
 * baseline differently than a destroyer's, in proportion to that ship's
 * own loadout. `shieldPierce` and the per-shot energy/heat costs are
 * absolute (not scales) because they represent the weapon's identity
 * regardless of hull.
 *
 * @typedef {Object} WeaponArchetypeProfile
 * @property {number} damageScale    Multiplier on `ship.weaponDamage`.
 * @property {number} speedScale     Multiplier on `ship.weaponSpeed`.
 * @property {number} rangeScale     Multiplier on `ship.weaponRange`.
 * @property {number} cooldownScale  Multiplier on `ship.weaponCooldown`.
 * @property {number} shieldPierce   Absolute pierce fraction (0..1).
 * @property {number} energyCost     Per-shot energy drained from the ship.
 * @property {number} heatCost       Per-shot heat added to the ship.
 */

/**
 * Frozen table of archetype → profile. Both the outer object and every
 * profile are deep-frozen so callers can rely on the tuning being stable.
 * @type {Readonly<Record<string, Readonly<WeaponArchetypeProfile>>>}
 */
export const WEAPON_ARCHETYPE_PROFILES = Object.freeze({
  [WeaponArchetype.KINETIC]: Object.freeze({
    damageScale: 0.85,
    speedScale: 1.2,
    rangeScale: 1.0,
    cooldownScale: 0.6,
    shieldPierce: 0,
    energyCost: 3,
    heatCost: 5,
  }),
  [WeaponArchetype.ENERGY]: Object.freeze({
    damageScale: 1.0,
    speedScale: 1.0,
    rangeScale: 1.1,
    cooldownScale: 1.0,
    shieldPierce: 0.25,
    energyCost: 6,
    heatCost: 8,
  }),
  [WeaponArchetype.BEAM]: Object.freeze({
    // BEAM is a "hitscan-feeling" weapon implemented as a very fast,
    // short-lived projectile: high muzzle velocity (3x) and reduced
    // range so the engagement envelope is intentionally short. Damage
    // is heavy per shot and the cooldown / heat cost are punishing
    // so it can't be spammed.
    damageScale: 1.4,
    speedScale: 3.0,
    rangeScale: 0.45,
    cooldownScale: 1.6,
    shieldPierce: 0.15,
    energyCost: 9,
    heatCost: 18,
  }),
  [WeaponArchetype.MISSILE]: Object.freeze({
    damageScale: 2.2,
    speedScale: 0.55,
    rangeScale: 1.4,
    cooldownScale: 2.0,
    shieldPierce: 0.4,
    energyCost: 12,
    heatCost: 10,
  }),
  [WeaponArchetype.FLAK]: Object.freeze({
    // Rapid-fire point defense: many cheap, low-damage, very short-range
    // bursts. No shield pierce, lowest heat per shot, snappiest cooldown.
    damageScale: 0.5,
    speedScale: 1.4,
    rangeScale: 0.5,
    cooldownScale: 0.4,
    shieldPierce: 0,
    energyCost: 4,
    heatCost: 4,
  }),
});

/**
 * Default per-shot costs used by `SpaceEngine.fireWeapon` when a ship has
 * no archetype applied. These match the pre-archetype baseline so the
 * engine is byte-identical for un-archetyped ships.
 */
export const DEFAULT_WEAPON_COSTS = Object.freeze({
  energyCost: 6,
  heatCost: 8,
});

/**
 * Look up an archetype profile by name.
 * @param {string} archetype - One of `WeaponArchetype.*`.
 * @returns {Readonly<WeaponArchetypeProfile>|null} The matching profile,
 *   or `null` if the name is unknown.
 */
export function getArchetypeProfile(archetype) {
  if (typeof archetype !== "string") return null;
  return WEAPON_ARCHETYPE_PROFILES[archetype] || null;
}

/**
 * Applies an archetype profile onto a ship's weapon stats in place.
 *
 * The ship's current `weaponDamage`/`weaponSpeed`/`weaponRange`/
 * `weaponCooldown` are treated as the base loadout and multiplied by the
 * archetype's scale factors. `weaponShieldPierce`, `weaponEnergyCost`,
 * and `weaponHeatCost` are set absolutely from the profile. A stable
 * `weaponArchetype` tag is set on the ship for downstream consumers
 * (e.g. UI, AI heuristics).
 *
 * Stats are mutated only when a valid profile is found, so an unknown
 * archetype is a safe no-op.
 *
 * @param {Object} ship - The ship to mutate. Must expose
 *   `weaponDamage`/`weaponSpeed`/`weaponRange`/`weaponCooldown`.
 * @param {string} archetype - One of `WeaponArchetype.*`.
 * @returns {boolean} True if a profile was applied; false otherwise.
 */
export function applyArchetypeToShip(ship, archetype) {
  if (!ship) return false;
  const profile = getArchetypeProfile(archetype);
  if (!profile) return false;

  ship.weaponArchetype = archetype;
  ship.weaponDamage = ship.weaponDamage * profile.damageScale;
  ship.weaponSpeed = ship.weaponSpeed * profile.speedScale;
  ship.weaponRange = ship.weaponRange * profile.rangeScale;
  ship.weaponCooldown = ship.weaponCooldown * profile.cooldownScale;
  ship.weaponShieldPierce = profile.shieldPierce;
  ship.weaponEnergyCost = profile.energyCost;
  ship.weaponHeatCost = profile.heatCost;
  return true;
}
