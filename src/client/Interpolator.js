/**
 * Client-Side Entity Interpolation & Remote Ship Smoothing (spec 083).
 *
 * Caches rolling history buffers (timestamp + position + heading) for every
 * active remote entity, and interpolates positions linearly (LERP) and angles
 * via shortest-arc angular LERP behind the current render time by a
 * configurable buffer delay.  This eliminates visual jitter caused by 30 Hz
 * server update intervals or momentary packet latency spikes.
 */

/**
 * @typedef {Object} Snapshot
 * @property {number} time  - Server-provided or locally-stamped time (ms).
 * @property {number} x     - X world coordinate.
 * @property {number} y     - Y world coordinate.
 * @property {number} heading - Heading in radians.
 */

export class EntityInterpolator {
  /**
   * @param {Object} [config]
   * @param {number} [config.bufferDelay=100] - Render behind real-time by
   *   this many milliseconds.  A value of one server tick (≈33 ms at 30 Hz)
   *   or slightly above guarantees at least one past snapshot pair is
   *   available for interpolation.
   * @param {number} [config.maxHistory=10] - Rolling history size per entity.
   */
  constructor({ bufferDelay = 100, maxHistory = 10 } = {}) {
    this.bufferDelay = bufferDelay;
    this.maxHistory = maxHistory;

    /**
     * Per-entity snapshot history ring.
     * Key = entity id, Value = Snapshot[] sorted ascending by time.
     * @type {Map<string, Snapshot[]>}
     */
    this.histories = new Map();
  }

  /**
   * Pushes a new snapshot for `entityId` into the rolling buffer.
   * Call once per server state update for each remote entity.
   *
   * @param {string} entityId
   * @param {number} time - Current time stamp in ms (e.g. Date.now()).
   * @param {number} x
   * @param {number} y
   * @param {number} heading
   */
  push(entityId, time, x, y, heading) {
    let list = this.histories.get(entityId);
    if (!list) {
      list = [];
      this.histories.set(entityId, list);
    }
    list.push({ time, x, y, heading });
    // Trim to rolling window size
    while (list.length > this.maxHistory) {
      list.shift();
    }
  }

  /**
   * Returns the interpolated position + heading for `entityId` at the given
   * render time.  Render time is offset behind `now` by `bufferDelay`.
   *
   * If no history exists, returns `null`.
   * If only a single snapshot exists, returns it verbatim.
   * If renderTime is before the earliest snapshot, returns the earliest.
   * If renderTime is after the latest snapshot, extrapolates linearly from
   * the last two snapshots (clamped to a small window to avoid runaway drift).
   *
   * @param {string} entityId
   * @param {number} now - Current wall-clock timestamp in ms.
   * @returns {{ x: number, y: number, heading: number } | null}
   */
  getInterpolated(entityId, now) {
    const list = this.histories.get(entityId);
    if (!list || list.length === 0) return null;

    const renderTime = now - this.bufferDelay;

    // Single snapshot — return as-is
    if (list.length === 1) {
      const s = list[0];
      return { x: s.x, y: s.y, heading: s.heading };
    }

    // Before earliest snapshot — clamp
    if (renderTime <= list[0].time) {
      const s = list[0];
      return { x: s.x, y: s.y, heading: s.heading };
    }

    // After latest snapshot — extrapolate from last two (capped)
    const last = list[list.length - 1];
    if (renderTime >= last.time) {
      const prev = list[list.length - 2];
      const segmentDt = last.time - prev.time;
      if (segmentDt <= 0) {
        return { x: last.x, y: last.y, heading: last.heading };
      }
      // Cap extrapolation to half a segment to avoid runaway drift
      const overshoot = Math.min(renderTime - last.time, segmentDt * 0.5);
      const t = overshoot / segmentDt;
      // Extrapolate heading the same way as position: carry the last segment's
      // angular velocity forward by `t`. (Previously this was fed to lerpAngle
      // with a hardcoded factor of 0, which discarded the extrapolation and
      // froze the heading at last.heading.)
      return {
        x: last.x + (last.x - prev.x) * t,
        y: last.y + (last.y - prev.y) * t,
        heading: last.heading + shortestArc(prev.heading, last.heading) * t,
      };
    }

    // Find the two bracketing snapshots and interpolate between them
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (renderTime >= a.time && renderTime <= b.time) {
        const segDt = b.time - a.time;
        const t = segDt <= 0 ? 0 : (renderTime - a.time) / segDt;
        return {
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
          heading: lerpAngle(a.heading, b.heading, t),
        };
      }
    }

    // Fallback (should not reach here)
    return { x: last.x, y: last.y, heading: last.heading };
  }

  /**
   * Removes history for an entity that is no longer present.
   * @param {string} entityId
   */
  remove(entityId) {
    this.histories.delete(entityId);
  }

  /**
   * Prunes all entities whose latest snapshot is older than `cutoffTime`.
   * Call periodically to prevent memory leaks from despawned entities.
   * @param {number} cutoffTime - Timestamps older than this are considered stale.
   */
  prune(cutoffTime) {
    for (const [id, list] of this.histories) {
      if (list.length === 0 || list[list.length - 1].time < cutoffTime) {
        this.histories.delete(id);
      }
    }
  }

  /** Clears all history (e.g. on room change). */
  clear() {
    this.histories.clear();
  }
}

// ── Pure math helpers ───────────────────────────────────────────────────────

/**
 * Linear interpolation between two scalar values.
 * @param {number} a
 * @param {number} b
 * @param {number} t - Interpolation factor in [0, 1].
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Computes the shortest signed arc between two angles in radians.
 * Result is in (-π, π].
 * @param {number} from - Start angle (radians).
 * @param {number} to   - End angle (radians).
 * @returns {number}
 */
export function shortestArc(from, to) {
  let diff = (to - from) % (2 * Math.PI);
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

/**
 * Shortest-arc angular LERP between two heading angles.
 * @param {number} a - Start angle (radians).
 * @param {number} b - End angle (radians).
 * @param {number} t - Interpolation factor in [0, 1].
 * @returns {number}
 */
export function lerpAngle(a, b, t) {
  return a + shortestArc(a, b) * t;
}
