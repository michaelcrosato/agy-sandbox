/**
 * Boarding (EW2) — pure helpers for boarding a disabled ship: plundering a
 * hostile (cargo + a cut of its credits) or repairing a friendly back to life.
 *
 * Faction-agnostic by design: the caller decides whether a given target is a
 * plunder or a repair candidate; this module only enforces the physical board
 * conditions and moves the goods. No DOM, sockets, timers, or `Math.random`;
 * functions mutate only the boarder/target passed in.
 */

/** Default boarding rules. Frozen; override per-call. */
export const DEFAULT_BOARDING_OPTIONS = Object.freeze({
  boardRange: 60, // max distance (units) between boarder and target
  maxBoardSpeed: 40, // boarder must be slower than this to dock
  plunderCreditFraction: 0.5, // share of the target's credits taken on plunder
});

/**
 * Whether `boarder` may board `target`: the target must be disabled, and the
 * boarder must be close and moving slowly (a controlled docking), and not itself.
 * @param {Object} boarder - Ship-like with `position`, `velocity`.
 * @param {Object} target - Ship-like with `isDisabled`, `position`.
 * @param {Object} [options] - Partial override of {@link DEFAULT_BOARDING_OPTIONS}.
 * @returns {boolean}
 */
export function canBoard(boarder, target, options = {}) {
  const o = { ...DEFAULT_BOARDING_OPTIONS, ...options };
  if (!boarder || !target || boarder === target) return false;
  if (!target.isDisabled) return false;
  if (!boarder.position || !target.position) return false;
  const dist = boarder.position.distance(target.position);
  if (!Number.isFinite(dist) || dist > o.boardRange) return false;
  const speed = boarder.velocity ? boarder.velocity.magnitude() : 0;
  if (speed > o.maxBoardSpeed) return false;
  return true;
}

/**
 * Plunders a boardable target: moves its cargo into the boarder's free hold and
 * transfers a fraction of its credits. Sets `target.looted` so a target can only
 * be plundered once (idempotent). No-op (ok:false) if boarding is not permitted
 * or the target was already looted.
 * @param {Object} boarder - Mutated (`cargo`, `credits`).
 * @param {Object} target - Mutated (`cargo`, `credits`, `looted`).
 * @param {Object} [options]
 * @returns {{ok: boolean, cargo: Object<string, number>, credits: number}}
 */
export function plunder(boarder, target, options = {}) {
  const o = { ...DEFAULT_BOARDING_OPTIONS, ...options };
  const fail = { ok: false, cargo: {}, credits: 0 };
  if (!canBoard(boarder, target, o)) return fail;
  if (target.looted) return fail;

  const moved = {};
  if (
    boarder.cargo &&
    target.cargo &&
    typeof boarder.getCargoWeight === "function" &&
    Number.isFinite(boarder.cargoCapacity)
  ) {
    let free = boarder.cargoCapacity - boarder.getCargoWeight();
    for (const commodity of Object.keys(target.cargo)) {
      if (free <= 0) break;
      const available = target.cargo[commodity] || 0;
      if (available <= 0) continue;
      if (boarder.cargo[commodity] === undefined) continue;
      const take = Math.min(available, free);
      boarder.cargo[commodity] += take;
      target.cargo[commodity] -= take;
      free -= take;
      moved[commodity] = take;
    }
  }

  let stolen = 0;
  if (Number.isFinite(target.credits) && target.credits > 0) {
    stolen = Math.floor(target.credits * o.plunderCreditFraction);
    target.credits -= stolen;
    if (Number.isFinite(boarder.credits)) boarder.credits += stolen;
  }

  target.looted = true;
  return { ok: true, cargo: moved, credits: stolen };
}

/**
 * Repairs a boardable (disabled) friendly: restores armor to max and clears the
 * disabled state, reviving it. Grants no cargo or credits.
 * @param {Object} boarder - The boarding ship (unchanged).
 * @param {Object} target - Mutated (`armor`, `isDisabled`).
 * @param {Object} [options]
 * @returns {{ok: boolean, repaired: number}}
 */
export function boardRepair(boarder, target, options = {}) {
  const o = { ...DEFAULT_BOARDING_OPTIONS, ...options };
  if (!canBoard(boarder, target, o)) return { ok: false, repaired: 0 };
  const max = Number.isFinite(target.maxArmor) ? target.maxArmor : 0;
  const cur = Number.isFinite(target.armor) ? target.armor : 0;
  const repaired = Math.max(0, max - cur);
  target.armor = max;
  target.isDisabled = false;
  return { ok: true, repaired };
}
