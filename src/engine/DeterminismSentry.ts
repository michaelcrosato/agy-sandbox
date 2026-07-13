/**
 * High-performance physics-loop determinism auditing utility.
 * Computes tick-by-tick state hashes of entity positions, velocities, and faction standings
 * using FNV-1a to detect coordinate jumps, drifts, and corruptions.
 */
export class DeterminismSentry {
  declare driftAlertsTotal;
  declare lastEntitiesState;
  declare lastFrameHash;
  constructor() {
    this.driftAlertsTotal = 0;
    this.lastFrameHash = null;
    this.lastEntitiesState = new Map(); // entityId -> { x, y, vx, vy, heading }
  }

  /**
   * Retrieves the accumulated count of determinism drift alerts.
   * @returns {number}
   */
  getDriftAlertsTotal() {
    return this.driftAlertsTotal;
  }

  /**
   * Resets the sentry's state and alert counters.
   */
  reset() {
    this.driftAlertsTotal = 0;
    this.lastFrameHash = null;
    this.lastEntitiesState.clear();
  }

  /**
   * Computes a 32-bit FNV-1a hash of a given string or number.
   * @param {string|number} strOrNum - The input to hash.
   * @returns {number} - 32-bit integer hash representation.
   */
  static fnv1a(strOrNum) {
    const str = typeof strOrNum === "string" ? strOrNum : String(strOrNum);
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) & 0xffffffff;
    }
    return hash;
  }

  /**
   * Combines two 32-bit hashes deterministically.
   * @param {number} h1 - First hash value.
   * @param {number} h2 - Second hash value.
   * @returns {number} - Combined 32-bit hash value.
   */
  static combineHashes(h1, h2) {
    return ((h1 ^ h2) * 16777619) & 0xffffffff;
  }

  /**
   * Audits the current state of a GameInstance, comparing entity structures and standing tables
   * to register drift alerts on anomalies.
   * @param {object} gameInstance - The GameInstance containing engine entities and standings.
   * @returns {number} - The cumulative frame hash value.
   */
  audit(gameInstance) {
    if (!gameInstance || !gameInstance.engine) return 0;

    let frameHash = 2166136261;

    // Sort entities deterministically by their dynamic ID
    const entities = [...gameInstance.engine.entities].sort((a, b) => {
      const idA = String(a.id || "");
      const idB = String(b.id || "");
      return idA.localeCompare(idB);
    });

    const currentStates = new Map();

    for (const ent of entities) {
      if (ent.isDestroyed) continue;

      const id = ent.id;
      const x = ent.position?.x ?? 0;
      const y = ent.position?.y ?? 0;
      const vx = ent.velocity?.x ?? 0;
      const vy = ent.velocity?.y ?? 0;
      const heading = ent.heading ?? 0;
      const mass = ent.mass ?? 0;

      currentStates.set(id, { x, y, vx, vy, heading });

      // Generate localized hash string representation
      const entString = `${id}:${x.toFixed(4)}:${y.toFixed(4)}:${vx.toFixed(4)}:${vy.toFixed(4)}:${heading.toFixed(4)}:${mass}`;
      const entHash = DeterminismSentry.fnv1a(entString);
      frameHash = DeterminismSentry.combineHashes(frameHash, entHash);

      // Audit drifts against preceding frame coordinate state matrices
      const prevState = this.lastEntitiesState.get(id);
      if (prevState) {
        const dx = x - prevState.x;
        const dy = y - prevState.y;

        const hasNan =
          isNaN(x) || isNaN(y) || isNaN(vx) || isNaN(vy) || isNaN(heading);
        const hasInfinite =
          !isFinite(x) || !isFinite(y) || !isFinite(vx) || !isFinite(vy);

        if (hasNan || hasInfinite) {
          this.driftAlertsTotal++;
          console.warn(
            `⚠️ [DETERMINISM SENTRY] State corruption (NaN/Infinite) detected on entity ${id}`,
          );
        } else {
          // Assert position change parameters (teleportation/physic jumps exceeding 500 units without warp)
          const distanceMoved = Math.sqrt(dx * dx + dy * dy);
          if (distanceMoved > 500) {
            this.driftAlertsTotal++;
            console.warn(
              `⚠️ [DETERMINISM SENTRY] Non-deterministic coordinate jump detected on entity ${id}: moved ${distanceMoved.toFixed(2)} units`,
            );
          }
        }
      }
    }

    // Hash per-player standings matrices deterministically
    if (
      gameInstance.factionRegistry &&
      gameInstance.factionRegistry.standings
    ) {
      const players = Object.keys(
        gameInstance.factionRegistry.standings,
      ).sort();
      for (const player of players) {
        const factions = Object.keys(
          gameInstance.factionRegistry.standings[player],
        ).sort();
        for (const faction of factions) {
          const score =
            gameInstance.factionRegistry.standings[player][faction] ?? 0;
          const standingHash = DeterminismSentry.fnv1a(
            `${player}:${faction}:${score.toFixed(4)}`,
          );
          frameHash = DeterminismSentry.combineHashes(frameHash, standingHash);
        }
      }
    }

    this.lastEntitiesState = currentStates;
    this.lastFrameHash = frameHash;

    return frameHash;
  }
}
