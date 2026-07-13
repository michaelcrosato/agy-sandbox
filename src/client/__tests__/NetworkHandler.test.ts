import { describe, it, expect, beforeEach } from "vitest";
import { NetworkHandler } from "../NetworkHandler.js";

// Spec 021 — client test harness. These cover the snapshot/delta
// reconstruction that NetworkHandler performs on the wire: the same
// keyframe/delta contract the server's StateCodec produces (P7). The logic was
// extracted out of the socket `onmessage` closure into pure methods so it can
// be exercised here without a live WebSocket.

describe("NetworkHandler snapshot/delta application", () => {
  /** @type {NetworkHandler} */
  let net;

  beforeEach(() => {
    net = new NetworkHandler();
  });

  it("starts with an empty snapshot and no adopted seq", () => {
    expect(net.serverSnapshot).toEqual({ entities: {} });
    expect(net.serverSeq).toBe(-1);
    expect(net.entitiesData).toEqual([]);
  });

  it("adopts a full keyframe wholesale and returns the entity list", () => {
    const entities = net.applySnapshotMessage({
      seq: 7,
      entities: {
        ship1: { id: "ship1", x: 0, y: 0 },
        rock2: { id: "rock2", x: 5, y: 5 },
      },
    });

    expect(net.serverSeq).toBe(7);
    expect(net.serverSnapshot.entities.ship1).toEqual({
      id: "ship1",
      x: 0,
      y: 0,
    });
    expect(entities).toHaveLength(2);
    expect(net.entitiesData).toBe(entities);
  });

  it("tolerates a keyframe with no entities field", () => {
    const entities = net.applySnapshotMessage({ seq: 1 });
    expect(net.serverSnapshot).toEqual({ entities: {} });
    expect(net.serverSeq).toBe(1);
    expect(entities).toEqual([]);
  });

  it("applies a matching delta: add + field update + removal", () => {
    net.applySnapshotMessage({
      seq: 0,
      entities: {
        ship1: { id: "ship1", x: 0, hp: 100 },
        rock2: { id: "rock2", x: 5 },
      },
    });

    const entities = net.applyDeltaMessage({
      baseSeq: 0,
      seq: 1,
      delta: {
        added: [{ id: "drone3", x: 9 }],
        updated: { ship1: { hp: 80 } },
        removed: ["rock2"],
      },
    });

    expect(net.serverSeq).toBe(1);
    expect(net.serverSnapshot.entities).toEqual({
      ship1: { id: "ship1", x: 0, hp: 80 },
      drone3: { id: "drone3", x: 9 },
    });
    expect(entities).toHaveLength(2);
  });

  it("drops a stale delta whose baseSeq does not match, leaving state intact", () => {
    net.applySnapshotMessage({
      seq: 4,
      entities: { ship1: { id: "ship1", x: 0 } },
    });
    const snapshotBefore = net.serverSnapshot;

    const result = net.applyDeltaMessage({
      baseSeq: 3, // we hold seq 4 — this delta is for the wrong base
      seq: 5,
      delta: { added: [{ id: "ghost", x: 1 }], updated: {}, removed: [] },
    });

    expect(result).toBeNull();
    expect(net.serverSeq).toBe(4); // unchanged
    expect(net.serverSnapshot).toBe(snapshotBefore); // untouched reference
    expect(net.serverSnapshot.entities.ghost).toBeUndefined();
  });

  it("reconstructs the right entity set across a snapshot→delta→delta sequence", () => {
    net.applySnapshotMessage({
      seq: 10,
      entities: { a: { id: "a", v: 1 } },
    });
    net.applyDeltaMessage({
      baseSeq: 10,
      seq: 11,
      delta: { added: [{ id: "b", v: 2 }], updated: {}, removed: [] },
    });
    net.applyDeltaMessage({
      baseSeq: 11,
      seq: 12,
      delta: { added: [], updated: { a: { v: 99 } }, removed: ["b"] },
    });

    expect(net.serverSeq).toBe(12);
    expect(net.serverSnapshot.entities).toEqual({ a: { id: "a", v: 99 } });
    expect(net.entitiesData).toEqual([{ id: "a", v: 99 }]);
  });

  it("resyncs from a fresh keyframe after a delta was dropped as stale", () => {
    net.applySnapshotMessage({ seq: 0, entities: { a: { id: "a" } } });
    // A frame is missed: this delta's base (1) does not match our seq (0).
    expect(
      net.applyDeltaMessage({
        baseSeq: 1,
        seq: 2,
        delta: { added: [], updated: {}, removed: [] },
      }),
    ).toBeNull();
    expect(net.serverSeq).toBe(0);

    // The server's periodic keyframe self-heals the client.
    const entities = net.applySnapshotMessage({
      seq: 3,
      entities: { a: { id: "a" }, b: { id: "b" } },
    });
    expect(net.serverSeq).toBe(3);
    expect(entities).toHaveLength(2);
  });
});
