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
 * Validates stargate distance and hyper-fuel requirements for a jump.
 * @param {Object} ship - The jumping ship.
 * @param {Object} gate - Stargate entity.
 * @param {number} [jumpCost] - Fuel cost.
 * @returns {{ ok: boolean, reason?: string }} Result.
 */
export function validateWarpJump(
  ship,
  gate,
  jumpCost = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost,
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
  return { ok: true };
}
