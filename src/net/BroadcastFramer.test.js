import { nextFrame, DEFAULT_KEYFRAME_INTERVAL } from "./BroadcastFramer.js";
import { applyDelta, encodeSnapshot } from "./StateCodec.js";

// Hand-built entity factories so every assertion is deterministic — no
// Math.random, no time-based fields, no Vector2D objects that might serialize
// non-deterministically.
function ship(id, overrides = {}) {
  return {
    id,
    type: "ship",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    radius: 12,
    name: `Ship-${id}`,
    shield: 100,
    maxShield: 100,
    armor: 50,
    maxArmor: 50,
    isDisabled: false,
    ...overrides,
  };
}

function asteroid(id, overrides = {}) {
  return {
    id,
    type: "generic",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    radius: 20,
    ...overrides,
  };
}

// Simulate the server-side tick: produce snapshots from a generator and walk
// the framer through `tickCount` ticks. Returns the chronological list of
// `{payload, isKeyframe}` records and the framer's final state.
function runFramerTicks(tickEntities, opts = {}) {
  let prev = null;
  const wireFrames = [];
  for (let i = 0; i < tickEntities.length; i++) {
    const frame = nextFrame({
      entities: tickEntities[i],
      prev,
      keyframeInterval: opts.keyframeInterval ?? DEFAULT_KEYFRAME_INTERVAL,
      forceKeyframe: opts.forceKeyframeOnTick === i,
    });
    wireFrames.push({
      payload: frame.payload,
      isKeyframe: frame.isKeyframe,
    });
    prev = frame.nextState;
  }
  return { wireFrames, finalState: prev };
}

// Walk a client through a stream of wire payloads applying the same logic the
// real `NetworkHandler` uses: keyframe replaces the snapshot, delta applies
// only if `baseSeq` matches the client's current seq, otherwise it is dropped
// until the next keyframe self-heals desync.
function replayClient(wireFrames) {
  let snapshot = { entities: {} };
  let seq = -1;
  const replays = [];
  for (const { payload } of wireFrames) {
    if (payload.type === "state_snapshot") {
      snapshot = { entities: { ...payload.entities } };
      seq = payload.seq;
    } else if (payload.type === "state_delta") {
      if (payload.baseSeq !== seq) {
        replays.push({ snapshot, seq, dropped: true });
        continue;
      }
      snapshot = applyDelta(snapshot, payload.delta);
      seq = payload.seq;
    }
    replays.push({ snapshot, seq, dropped: false });
  }
  return replays;
}

describe("BroadcastFramer.nextFrame", () => {
  test("emits a keyframe on the very first tick (no prior state)", () => {
    const frame = nextFrame({ entities: [ship("a")], prev: null });
    expect(frame.isKeyframe).toBe(true);
    expect(frame.payload.type).toBe("state_snapshot");
    expect(frame.payload.seq).toBe(1);
    expect(Object.keys(frame.payload.entities)).toEqual(["a"]);
  });

  test("the second tick emits a delta against the first keyframe", () => {
    const f1 = nextFrame({ entities: [ship("a", { x: 0 })], prev: null });
    const f2 = nextFrame({
      entities: [ship("a", { x: 10 })],
      prev: f1.nextState,
    });
    expect(f2.isKeyframe).toBe(false);
    expect(f2.payload.type).toBe("state_delta");
    expect(f2.payload.seq).toBe(2);
    expect(f2.payload.baseSeq).toBe(1);
    expect(f2.payload.delta.updated).toEqual({ a: { x: 10 } });
  });

  test("seq is monotonically increasing across keyframe/delta transitions", () => {
    const ticks = Array.from({ length: 7 }, (_, i) => [ship("a", { x: i })]);
    const { wireFrames } = runFramerTicks(ticks, { keyframeInterval: 3 });
    const seqs = wireFrames.map((f) => f.payload.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("a fresh keyframe lands every `keyframeInterval` ticks", () => {
    const ticks = Array.from({ length: 9 }, (_, i) => [ship("a", { x: i })]);
    const { wireFrames } = runFramerTicks(ticks, { keyframeInterval: 3 });
    // With interval=3 the cadence is keyframe → 2 deltas → keyframe → 2
    // deltas → ... so keyframes land on ticks 0, 3, and 6.
    const keyframeTickIndexes = wireFrames
      .map((f, i) => (f.isKeyframe ? i : -1))
      .filter((i) => i >= 0);
    expect(keyframeTickIndexes).toEqual([0, 3, 6]);
  });

  test("forceKeyframe overrides the cadence on the given tick", () => {
    const ticks = Array.from({ length: 5 }, (_, i) => [ship("a", { x: i })]);
    const { wireFrames } = runFramerTicks(ticks, {
      keyframeInterval: 100,
      forceKeyframeOnTick: 2,
    });
    expect(wireFrames[0].isKeyframe).toBe(true); // first-ever
    expect(wireFrames[1].isKeyframe).toBe(false);
    expect(wireFrames[2].isKeyframe).toBe(true); // forced
    expect(wireFrames[3].isKeyframe).toBe(false);
    expect(wireFrames[4].isKeyframe).toBe(false);
  });

  test("delta payload carries the exact diff between successive snapshots", () => {
    const t1 = [ship("a", { x: 0 }), asteroid("rock", { x: 100 })];
    const t2 = [ship("a", { x: 25 }), asteroid("rock", { x: 100 })];
    const f1 = nextFrame({ entities: t1, prev: null });
    const f2 = nextFrame({ entities: t2, prev: f1.nextState });
    expect(f2.payload.delta.added).toEqual([]);
    expect(f2.payload.delta.removed).toEqual([]);
    expect(f2.payload.delta.updated).toEqual({ a: { x: 25 } });
  });

  test("does not mutate the entity list it is given", () => {
    const ents = [ship("a", { x: 5 })];
    const before = JSON.parse(JSON.stringify(ents));
    nextFrame({ entities: ents, prev: null });
    expect(ents).toEqual(before);
  });

  test("nextState.snapshot deep-equals encodeSnapshot of the same entities", () => {
    const ents = [ship("a", { x: 7 }), asteroid("rock")];
    const frame = nextFrame({ entities: ents, prev: null });
    expect(frame.nextState.snapshot).toEqual(encodeSnapshot(ents));
  });
});

describe("BroadcastFramer → client roundtrip (P7 invariant)", () => {
  // The core property the task asks for: a keyframe followed by a run of
  // deltas reconstructs the same per-tick state a chain of full snapshots
  // would have produced. Drive both the framer and a parallel snapshot chain
  // for the same entity stream and assert per-tick equivalence.
  test("keyframe + run of deltas reconstructs each tick's snapshot exactly", () => {
    const ticks = [];
    // 25 ticks of varied churn: position drift, an entity appearing on tick
    // 5, another disappearing on tick 12, a field-level update on tick 18.
    for (let i = 0; i < 25; i++) {
      const tick = [
        ship("alpha", { x: i, y: i * 2, shield: 100 - i }),
        ship("beta", { x: -i, isDisabled: i >= 18 }),
      ];
      if (i >= 5) tick.push(asteroid("rock", { x: 500, vx: i * 10 }));
      if (i < 12) tick.push(ship("gamma", { x: 1000 - i, name: "Gamma" }));
      ticks.push(tick);
    }

    const { wireFrames } = runFramerTicks(ticks, { keyframeInterval: 7 });
    const replays = replayClient(wireFrames);

    // Every replayed snapshot equals encodeSnapshot of that tick's entities.
    for (let i = 0; i < ticks.length; i++) {
      expect(replays[i].dropped).toBe(false);
      expect(replays[i].snapshot).toEqual(encodeSnapshot(ticks[i]));
    }
  });

  test("at least 2 keyframes and many deltas were exercised", () => {
    const ticks = Array.from({ length: 25 }, (_, i) => [
      ship("alpha", { x: i }),
    ]);
    const { wireFrames } = runFramerTicks(ticks, { keyframeInterval: 7 });
    const keyframeCount = wireFrames.filter((f) => f.isKeyframe).length;
    const deltaCount = wireFrames.filter((f) => !f.isKeyframe).length;
    expect(keyframeCount).toBeGreaterThanOrEqual(2);
    expect(deltaCount).toBeGreaterThan(keyframeCount);
  });

  test("a client that misses a delta drops subsequent deltas until the next keyframe self-heals", () => {
    const ticks = Array.from({ length: 12 }, (_, i) => [
      ship("alpha", { x: i }),
    ]);
    // keyframeInterval=5 → ticks 0 and 5 and 10 are keyframes.
    const { wireFrames } = runFramerTicks(ticks, { keyframeInterval: 5 });
    // Simulate the client missing the tick-2 delta (drop it from the wire).
    const lossy = [...wireFrames];
    lossy.splice(2, 1);
    const replays = replayClient(lossy);

    // After the dropped delta, the next deltas in the run (which baseSeq
    // against the never-received tick-2 seq) must be skipped.
    expect(replays[0].dropped).toBe(false); // tick-0 keyframe
    expect(replays[0].snapshot).toEqual(encodeSnapshot(ticks[0]));

    expect(replays[1].dropped).toBe(false); // tick-1 delta against tick-0 → OK
    expect(replays[1].snapshot).toEqual(encodeSnapshot(ticks[1]));

    // lossy[2] was the original tick-3 delta with baseSeq=2; client holds
    // seq=2 from tick-1's applied delta, so... wait, tick-1's delta bumped
    // client to seq=2 already. tick-3's delta has baseSeq=3 (the dropped
    // tick-2's seq). So the client (still at seq=2) must drop it.
    expect(replays[2].dropped).toBe(true);

    // tick-4 delta baseSeq=4 → still mismatched → dropped.
    expect(replays[3].dropped).toBe(true);

    // tick-5 keyframe → resyncs, no longer dropped, snapshot matches truth.
    expect(replays[4].dropped).toBe(false);
    expect(replays[4].snapshot).toEqual(encodeSnapshot(ticks[5]));
  });

  test("entity churn (adds, removes, field updates) survives the keyframe/delta pipeline", () => {
    const ticks = [
      [ship("a", { x: 0 })], // keyframe
      [ship("a", { x: 1 }), ship("b")], // add b
      [ship("a", { x: 2 }), ship("b", { shield: 50 })], // update b.shield
      [ship("a", { x: 3 })], // remove b
      [ship("a", { x: 4 }), asteroid("rock", { x: 999 })], // add asteroid
    ];
    const { wireFrames } = runFramerTicks(ticks, { keyframeInterval: 100 });
    // Only one keyframe (the first), then deltas for the rest.
    expect(wireFrames.filter((f) => f.isKeyframe).length).toBe(1);

    const replays = replayClient(wireFrames);
    for (let i = 0; i < ticks.length; i++) {
      expect(replays[i].snapshot).toEqual(encodeSnapshot(ticks[i]));
    }
  });

  test("forced keyframe (simulating a new client join) re-syncs a desynced client mid-stream", () => {
    const ticks = Array.from({ length: 8 }, (_, i) => [
      ship("alpha", { x: i }),
    ]);
    const { wireFrames } = runFramerTicks(ticks, {
      keyframeInterval: 100, // disable scheduled keyframes
      forceKeyframeOnTick: 4, // simulate a new join on tick 4
    });
    expect(wireFrames[0].isKeyframe).toBe(true);
    expect(wireFrames[4].isKeyframe).toBe(true);

    // Drop tick-2 delta — client desyncs.
    const lossy = [...wireFrames];
    lossy.splice(2, 1);
    const replays = replayClient(lossy);

    // tick-3 delta dropped due to desync...
    expect(replays[2].dropped).toBe(true);
    // ...but the forced tick-4 keyframe heals it.
    expect(replays[3].dropped).toBe(false);
    expect(replays[3].snapshot).toEqual(encodeSnapshot(ticks[4]));
  });
});
