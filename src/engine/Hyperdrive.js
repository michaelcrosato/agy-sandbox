/**
 * Hyperdrive (EW3) — pure helpers for the hyperdrive fuel economy: gating and
 * paying for sector jumps, and regenerating fuel (Ramscoop) / refilling it.
 *
 * `Ship.hyperFuel` / `maxHyperFuel` already exist; this module is the single,
 * testable home for the jump-cost and fuel-regen math so the server's warp
 * handler and `Ship.update` stay thin. No DOM, sockets, timers, or `Math.random`;
 * functions mutate only the ship passed to them.
 */

/** Default hyperdrive tuning. Frozen; override per-call. */
export const DEFAULT_HYPERDRIVE_OPTIONS = Object.freeze({
  jumpCost: 20, // hyperFuel consumed per sector jump (matches legacy warp cost)
  ramscoopRate: 0, // base passive fuel/sec; the Ramscoop outfit raises a ship's rate
});

/**
 * Whether the ship has enough fuel to jump.
 * @param {Object} ship - Ship-like with `hyperFuel`.
 * @param {number} [cost] - Fuel required (defaults to `jumpCost`).
 * @returns {boolean}
 */
export function canJump(ship, cost = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost) {
  if (!ship) return false;
  const need = Number.isFinite(cost)
    ? cost
    : DEFAULT_HYPERDRIVE_OPTIONS.jumpCost;
  return Number.isFinite(ship.hyperFuel) && ship.hyperFuel >= need;
}

/**
 * Spends jump fuel if the ship can afford it. Clamps the result at 0.
 * @param {Object} ship - Mutated on success (`hyperFuel`).
 * @param {number} [cost] - Fuel to spend (defaults to `jumpCost`).
 * @returns {boolean} True if the jump was paid for; false (no mutation) otherwise.
 */
export function consumeJump(ship, cost = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost) {
  const need = Number.isFinite(cost)
    ? cost
    : DEFAULT_HYPERDRIVE_OPTIONS.jumpCost;
  if (!canJump(ship, need)) return false;
  ship.hyperFuel = Math.max(0, ship.hyperFuel - need);
  return true;
}

/**
 * Adds fuel, clamped to `maxHyperFuel`.
 * @param {Object} ship - Mutated (`hyperFuel`).
 * @param {number} units - Fuel to add (must be a positive finite number).
 * @returns {number} The amount actually added (0 on bad input or a full tank).
 */
export function refuel(ship, units) {
  if (!ship || !Number.isFinite(units) || units <= 0) return 0;
  const max = Number.isFinite(ship.maxHyperFuel) ? ship.maxHyperFuel : 0;
  const before = Number.isFinite(ship.hyperFuel) ? ship.hyperFuel : 0;
  const after = Math.min(max, before + units);
  ship.hyperFuel = after;
  return after - before;
}

/**
 * Passive Ramscoop fuel regeneration over a time step. No-op when the rate is
 * non-positive (ships without a Ramscoop) or dt is invalid.
 * @param {Object} ship - Mutated (`hyperFuel`).
 * @param {number} dt - Elapsed seconds.
 * @param {number} [rate] - Fuel per second (defaults to `ramscoopRate`).
 * @returns {number} Fuel actually added.
 */
export function ramscoopRegen(
  ship,
  dt,
  rate = DEFAULT_HYPERDRIVE_OPTIONS.ramscoopRate,
) {
  if (!ship || !Number.isFinite(dt) || dt <= 0) return 0;
  const r = Number.isFinite(rate)
    ? rate
    : DEFAULT_HYPERDRIVE_OPTIONS.ramscoopRate;
  if (r <= 0) return 0;
  return refuel(ship, r * dt);
}

/**
 * Calculates the stargate warp toll based on faction standing.
 * @param {Object} ship - The jumping ship.
 * @param {Object|null} factionRegistry - The FactionRegistry instance.
 * @param {string} governingFaction - Governing faction of the sector.
 * @returns {number} The credit toll to charge.
 */
export function getWarpToll(ship, factionRegistry, governingFaction) {
  if (
    !ship ||
    !factionRegistry ||
    !governingFaction ||
    governingFaction === "Independents"
  ) {
    return 0;
  }
  const standing = factionRegistry.getStanding(ship.id, governingFaction);
  if (standing >= 50) return 0; // Allied/Friendly
  if (standing <= -16) return 500; // Hostile
  return 150; // Neutral
}

/**
 * Validates stargate distance, hyper-fuel, and credit toll requirements for a jump.
 * @param {Object} ship - The jumping ship.
 * @param {Object} gate - Stargate entity.
 * @param {number} [jumpCost] - Fuel cost.
 * @param {Object|null} [factionRegistry] - Faction standings.
 * @param {string} [governingFaction] - Faction name.
 * @returns {{ ok: boolean, reason?: string }} Result.
 */
/**
 * Helper to determine if an entity is hostile to the jumping ship.
 * @param {Object} ship - The jumping ship.
 * @param {Object} ent - Candidate entity.
 * @param {Object|null} factionRegistry - Standings/relations registry.
 * @returns {boolean}
 */
export function isEntityHostile(ship, ent, factionRegistry) {
  if (!ship || !ent) return false;
  if (ent.isDestroyed) return false;

  // Role-based hostility
  const isPirate =
    ent.role === "pirate" ||
    (typeof ent.name === "string" &&
      (ent.name.includes("Pirate") || ent.name.includes("Raider")));
  const selfIsPirate =
    ship.role === "pirate" ||
    (typeof ship.name === "string" &&
      (ship.name.includes("Pirate") || ship.name.includes("Raider")));

  if (isPirate && !selfIsPirate) return true;
  if (ent.role === "guard" && selfIsPirate) return true;

  // Faction standing hostility
  if (factionRegistry) {
    const threshold =
      factionRegistry.options &&
      factionRegistry.options.hostileThreshold !== undefined
        ? factionRegistry.options.hostileThreshold
        : -30;

    if (ent.faction && ship.id) {
      const standing = factionRegistry.getStanding(ship.id, ent.faction);
      if (standing <= threshold) return true;
    }
    if (ship.faction && ent.id) {
      const standing = factionRegistry.getStanding(ent.id, ship.faction);
      if (standing <= threshold) return true;
    }
    if (ship.faction && ent.faction) {
      if (factionRegistry.getRelation(ship.faction, ent.faction) === "enemy") {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validates stargate distance, hyper-fuel, and credit toll requirements for a jump.
 * @param {Object} ship - The jumping ship.
 * @param {Object} gate - Stargate entity.
 * @param {number} [jumpCost] - Fuel cost.
 * @param {Object|null} [factionRegistry] - Faction standings.
 * @param {string} [governingFaction] - Faction name.
 * @param {Array<Object>} [entities] - Array of all entities in sector.
 * @returns {{ ok: boolean, reason?: string }} Result.
 */
export function validateWarpJump(
  ship,
  gate,
  jumpCost = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost,
  factionRegistry = null,
  governingFaction = "Independents",
  entities = [],
) {
  if (!ship || !gate || gate.type !== "warp_gate") {
    return { ok: false, reason: "Warp Gate invalid or not found!" };
  }
  if (!ship.position || !gate.position) {
    return { ok: false, reason: "Stargate positions not loaded!" };
  }
  const dist = ship.position.distance(gate.position);
  if (dist > 150) {
    return {
      ok: false,
      reason: "Too far from stargate to initiate warp jump! Move within 150u.",
    };
  }
  if (!canJump(ship, jumpCost)) {
    return {
      ok: false,
      reason: `Insufficient Hyper-Fuel! Requires ${jumpCost} units. Land on a planet to refuel.`,
    };
  }

  // Calculate and validate toll affordability
  const toll = getWarpToll(ship, factionRegistry, governingFaction);
  if (toll > 0) {
    const credits = Number.isFinite(ship.credits) ? ship.credits : 0;
    if (credits < toll) {
      return {
        ok: false,
        reason: `Insufficient credits for warp gate toll! Requires ${toll} CR.`,
      };
    }
  }

  // Check for active hostile interdiction fields within 300 units
  if (Array.isArray(entities) && entities.length > 0) {
    for (const ent of entities) {
      if (
        ent &&
        ent.type === "ship" &&
        ent !== ship &&
        typeof ent.hasActiveInterdictor === "function" &&
        ent.hasActiveInterdictor()
      ) {
        if (isEntityHostile(ship, ent, factionRegistry)) {
          const d = ship.position.distance(ent.position);
          if (d <= 300) {
            return {
              ok: false,
              reason: "WARP ENGINE DISRUPTED: Interdiction Gravity Well Active",
            };
          }
        }
      }
    }
  }

  return { ok: true };
}
