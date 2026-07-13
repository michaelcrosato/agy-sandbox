/**
 * BroadcastFramer — pure framing helper for the P7 snapshot/delta world-state
 * broadcast pipeline.
 *
 * Wraps StateCodec into a stateless transition function the server calls once
 * per tick. Given the live entity list and the previous broadcast state, it
 * decides whether the next wire payload is a full keyframe (`state_snapshot`)
 * or a delta (`state_delta`) against the previous keyframe-or-delta, and
 * returns both the payload and the next state so the caller can fold it back
 * into per-room state without leaking any mutation.
 *
 * Keyframe cadence: the framer emits a keyframe on the first call (no prior
 * state), every `keyframeInterval` ticks thereafter, and whenever the caller
 * sets `forceKeyframe: true` (used when a client newly joins/reconnects so
 * the room re-syncs immediately rather than waiting up to ~1s for the next
 * scheduled keyframe). Between keyframes the framer emits deltas computed
 * against the previous snapshot, tagged with `baseSeq` so the receiver can
 * detect desync (`baseSeq !== client.seq` → ignore until the next keyframe).
 */

import { encodeSnapshot, diff } from "./StateCodec.js";

/**
 * Default number of ticks between keyframes. At 30Hz this is ~1s, which gives
 * any client that missed a delta at most one second of stale visuals before a
 * keyframe self-heals the desync.
 */
export const DEFAULT_KEYFRAME_INTERVAL = 30;

/**
 * @typedef {Object} BroadcastState
 * @property {import("./StateCodec.js").Snapshot} snapshot - Snapshot just broadcast.
 * @property {number} seq - Monotonic sequence number of the just-broadcast payload.
 * @property {number} ticksSinceKeyframe - Ticks since the last keyframe (0 if this call emitted one).
 */

/**
 * @typedef {Object} BroadcastFrame
 * @property {Object} payload - Wire object to send to clients ({type, seq, ...}).
 * @property {BroadcastState} nextState - Folded state to pass back in on the next tick.
 * @property {boolean} isKeyframe - True if `payload.type === "state_snapshot"`.
 */

/**
 * Produces the next broadcast frame for a room.
 *
 * @param {Object} params
 * @param {Array<Object>} params.entities - Live serialized entities for this tick (each with `id`).
 * @param {BroadcastState|null|undefined} params.prev - Previous broadcast state, or null/undefined on first tick.
 * @param {number} [params.keyframeInterval=DEFAULT_KEYFRAME_INTERVAL] - Ticks between scheduled keyframes.
 * @param {boolean} [params.forceKeyframe=false] - Force a keyframe regardless of cadence (e.g., new join).
 * @returns {BroadcastFrame}
 */
export function nextFrame({
  entities,
  prev,
  keyframeInterval = DEFAULT_KEYFRAME_INTERVAL,
  forceKeyframe = false,
}) {
  const currentSnapshot = encodeSnapshot(entities);
  const nextSeq = (prev && Number.isFinite(prev.seq) ? prev.seq : 0) + 1;

  const noPrior = !prev || !prev.snapshot;
  // `ticksSinceKeyframe` counts ticks since the last keyframe (0 right after
  // one). The next emit becomes a keyframe when adding the current tick would
  // cross `keyframeInterval` — so with interval=30 you get a keyframe on
  // ticks 0, 30, 60, ... and 29 deltas between each.
  const cadenceDue =
    !noPrior && (prev.ticksSinceKeyframe ?? 0) + 1 >= keyframeInterval;
  const isKeyframe = forceKeyframe || noPrior || cadenceDue;

  let payload;
  let ticksSinceKeyframe;
  if (isKeyframe) {
    payload = {
      type: "state_snapshot",
      seq: nextSeq,
      entities: currentSnapshot.entities,
    };
    ticksSinceKeyframe = 0;
  } else {
    const delta = diff(prev.snapshot, currentSnapshot);
    payload = {
      type: "state_delta",
      seq: nextSeq,
      baseSeq: prev.seq,
      delta,
    };
    ticksSinceKeyframe = (prev.ticksSinceKeyframe ?? 0) + 1;
  }

  return {
    payload,
    nextState: {
      snapshot: currentSnapshot,
      seq: nextSeq,
      ticksSinceKeyframe,
    },
    isKeyframe,
  };
}
