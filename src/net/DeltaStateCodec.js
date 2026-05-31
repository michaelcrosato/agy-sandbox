/**
 * DeltaStateCodec — snapshot delta compression utility (spec 072).
 *
 * Computes difference-only updates (deltas) between the current frame and an
 * acknowledged baseline frame of a client. This drastically reduces the egress
 * network bandwidth payload since only modified fields and deletions are sent.
 */
export class DeltaStateCodec {
  /**
   * Computes a delta snapshot of the current state compared to an acknowledged baseline.
   * @param {Object} state - The current full state `{ frame, entities }`.
   * @param {Object|null} baseline - The baseline state `{ frame, entities }` or null (full snapshot).
   * @returns {Object} The computed delta snapshot.
   */
  static encodeDelta(state, baseline) {
    if (!state) {
      throw new Error("DeltaStateCodec.encodeDelta: current state is required");
    }

    const currentEntities = state.entities || {};
    const baselineEntities = baseline ? baseline.entities || {} : {};

    const deltaEntities = {};
    const deleted = [];

    // 1. Find new or modified entities
    for (const [id, currentEnt] of Object.entries(currentEntities)) {
      const baselineEnt = baselineEntities[id];
      if (!baselineEnt) {
        // New entity: include full copy
        deltaEntities[id] = JSON.parse(JSON.stringify(currentEnt));
      } else {
        // Existing entity: find differences
        const entDelta = {};
        let changed = false;

        for (const [field, val] of Object.entries(currentEnt)) {
          // If the field is an object, do a deep equality check or JSON match to prevent reference mutations
          if (typeof val === "object" && val !== null) {
            if (JSON.stringify(baselineEnt[field]) !== JSON.stringify(val)) {
              entDelta[field] = JSON.parse(JSON.stringify(val));
              changed = true;
            }
          } else if (baselineEnt[field] !== val) {
            // Field changed or is new
            entDelta[field] = val;
            changed = true;
          }
        }

        if (changed) {
          entDelta.id = id; // id is always required to identify the entity
          deltaEntities[id] = entDelta;
        }
      }
    }

    // 2. Find deleted entities
    for (const id of Object.keys(baselineEntities)) {
      if (!currentEntities[id]) {
        deleted.push(id);
      }
    }

    return {
      frame: state.frame,
      baselineFrame: baseline ? baseline.frame : null,
      entities: deltaEntities,
      deleted,
    };
  }

  /**
   * Reconstitutes a full state by applying a delta snapshot on top of an acknowledged baseline.
   * @param {Object} delta - The received delta snapshot `{ frame, baselineFrame, entities, deleted }`.
   * @param {Object|null} baseline - The baseline state `{ frame, entities }` or null.
   * @returns {Object} The reconstituted full state.
   */
  static decodeDelta(delta, baseline) {
    if (!delta) {
      throw new Error("DeltaStateCodec.decodeDelta: delta is required");
    }

    const resultEntities = {};
    const baselineEntities = baseline ? baseline.entities || {} : {};

    // 1. Copy over baseline entities if they weren't deleted
    const deletedSet = new Set(delta.deleted || []);
    for (const [id, ent] of Object.entries(baselineEntities)) {
      if (!deletedSet.has(id)) {
        resultEntities[id] = JSON.parse(JSON.stringify(ent));
      }
    }

    // 2. Apply entity deltas or add new entities
    const deltaEntities = delta.entities || {};
    for (const [id, entDelta] of Object.entries(deltaEntities)) {
      const existing = resultEntities[id];
      if (!existing) {
        // New entity
        resultEntities[id] = JSON.parse(JSON.stringify(entDelta));
      } else {
        // Merge modifications into existing
        for (const [field, val] of Object.entries(entDelta)) {
          if (typeof val === "object" && val !== null) {
            existing[field] = JSON.parse(JSON.stringify(val));
          } else {
            existing[field] = val;
          }
        }
      }
    }

    return {
      frame: delta.frame,
      entities: resultEntities,
    };
  }
}
