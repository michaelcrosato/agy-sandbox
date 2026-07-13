/**
 * StateCodec — pure, deterministic snapshot + delta codec for the authoritative
 * world broadcast pipeline (P7: Netcode & Scale).
 *
 * The server currently ships the full serialized entity list every tick. This
 * module is the headless foundation for replacing that with snapshot/delta sync:
 * encode a keyframe from the current entities, compute a structural diff against
 * the previous snapshot, and reconstruct the next snapshot on the receiving end
 * from (previous snapshot + delta).
 *
 * Invariant:
 *   applyDelta(prev, diff(prev, next)) deep-equals next
 * for any sets of adds, removes, and partial field updates.
 *
 * The module is intentionally free of DOM, sockets, timers, and randomness so it
 * can be unit-tested deterministically and reused wherever pure state-sync helps.
 */

/**
 * @typedef {Object} Snapshot
 * @property {Object<string, Object>} entities - Map of entity id -> entity payload.
 */

/**
 * @typedef {Object} Delta
 * @property {Array<Object>} added - Full entity payloads new since the previous snapshot.
 * @property {Object<string, Object>} updated - Map of entity id -> changed fields only.
 * @property {Array<string>} removed - Ids of entities present before and gone now.
 */

/**
 * Deep-clones a JSON-shaped value (plain objects, arrays, primitives). Used to
 * keep snapshots, deltas, and applyDelta outputs structurally independent of
 * their inputs so callers can mutate one without affecting the other.
 * @param {*} value
 * @returns {*}
 */
function deepClone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const key of Object.keys(value)) {
    out[key] = deepClone(value[key]);
  }
  return out;
}

/**
 * Structural equality for JSON-shaped values. Treats arrays and plain objects
 * recursively and falls back to strict equality for primitives.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Builds a keyframe snapshot from the live entity list. Each entity is
 * deep-cloned and indexed by its unique `id` so diff and applyDelta can perform
 * O(n) id-keyed lookups instead of scanning arrays.
 * @param {Array<Object>} entities - Entities each carrying a unique `id` field.
 * @returns {Snapshot} A keyframe snapshot suitable for diffing.
 */
export function encodeSnapshot(entities) {
  const list = Array.isArray(entities) ? entities : [];
  const entitiesById = {};
  for (const entity of list) {
    if (
      entity === null ||
      entity === undefined ||
      entity.id === undefined ||
      entity.id === null
    ) {
      throw new Error("encodeSnapshot: every entity must have a defined id");
    }
    const id = String(entity.id);
    entitiesById[id] = deepClone(entity);
  }
  return { entities: entitiesById };
}

/**
 * Diffs two snapshots into the minimal delta needed to transform `prevSnapshot`
 * into `nextSnapshot`. Field-level granularity: only fields whose value changed
 * (by deep equality) appear under `updated[id]`. A field that exists in prev
 * but not in next is recorded with `undefined` so applyDelta can drop it.
 * @param {Snapshot} prevSnapshot
 * @param {Snapshot} nextSnapshot
 * @returns {Delta}
 */
export function diff(prevSnapshot, nextSnapshot) {
  const prev = (prevSnapshot && prevSnapshot.entities) || {};
  const next = (nextSnapshot && nextSnapshot.entities) || {};
  const added = [];
  const removed = [];
  const updated = {};

  for (const id of Object.keys(next)) {
    if (!Object.prototype.hasOwnProperty.call(prev, id)) {
      added.push(deepClone(next[id]));
      continue;
    }
    const prevEntity = prev[id];
    const nextEntity = next[id];
    const changes = {};
    let changed = false;
    const allFields = new Set([
      ...Object.keys(prevEntity),
      ...Object.keys(nextEntity),
    ]);
    for (const field of allFields) {
      const before = prevEntity[field];
      const after = nextEntity[field];
      if (!deepEqual(before, after)) {
        changes[field] = deepClone(after);
        changed = true;
      }
    }
    if (changed) {
      updated[id] = changes;
    }
  }

  for (const id of Object.keys(prev)) {
    if (!Object.prototype.hasOwnProperty.call(next, id)) {
      removed.push(id);
    }
  }

  return { added, updated, removed };
}

/**
 * Reconstructs the next snapshot from a previous snapshot and a delta. The
 * input snapshot is not mutated; the returned snapshot is a fresh deep clone.
 *
 * Application order is removals → updates → additions, so an id that is
 * removed-and-re-added in the same delta (an unusual but defensible case)
 * lands as the freshly-added payload rather than a half-merged update.
 * @param {Snapshot} snapshot
 * @param {Delta} delta
 * @returns {Snapshot}
 */
export function applyDelta(snapshot, delta) {
  const prev = (snapshot && snapshot.entities) || {};
  const nextEntities = {};
  for (const id of Object.keys(prev)) {
    nextEntities[id] = deepClone(prev[id]);
  }

  const added = (delta && delta.added) || [];
  const updated = (delta && delta.updated) || {};
  const removed = (delta && delta.removed) || [];

  for (const id of removed) {
    delete nextEntities[String(id)];
  }

  for (const id of Object.keys(updated)) {
    const target = nextEntities[id];
    if (!target) continue;
    const changes = updated[id];
    for (const field of Object.keys(changes)) {
      const value = changes[field];
      if (value === undefined) {
        delete target[field];
      } else {
        target[field] = deepClone(value);
      }
    }
  }

  for (const entity of added) {
    if (
      entity === null ||
      entity === undefined ||
      entity.id === undefined ||
      entity.id === null
    ) {
      continue;
    }
    nextEntities[String(entity.id)] = deepClone(entity);
  }

  return { entities: nextEntities };
}
