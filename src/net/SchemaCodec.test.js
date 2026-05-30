import { encode, decode, SCHEMA_PROTOCOL_VERSION } from "./SchemaCodec.js";
import { encode as binEncode } from "./BinaryCodec.js";
import { encodeSnapshot, diff, applyDelta } from "./StateCodec.js";

function rt(x) {
  return decode(encode(x));
}

describe("SchemaCodec round-trip (spec 038)", () => {
  test("primitives, floats, strings, nesting, undefined removals", () => {
    for (const v of [null, true, false, 0, -42, 2147483647, "ship", ""]) {
      expect(rt(v)).toStrictEqual(v);
    }
    expect(rt(1234.1)).toBe(1234.1); // bit-exact float64
    expect(rt([1, "a", [2, "a"], null])).toStrictEqual([
      1,
      "a",
      [2, "a"],
      null,
    ]);
    const delta = {
      added: [],
      updated: { e1: { shield: undefined, type: "ship" } },
      removed: ["e2"],
    };
    const out = rt(delta);
    expect(out).toStrictEqual(delta);
    expect(Object.keys(out.updated.e1)).toEqual(["shield", "type"]);
    expect(out.updated.e1.shield).toBeUndefined();
  });

  test("interns repeated string values (the same string round-trips identically)", () => {
    const frame = {
      type: "state_snapshot",
      entities: {
        a: { type: "ship", name: "ship" },
        b: { type: "ship", name: "ship" },
      },
    };
    expect(rt(frame)).toStrictEqual(frame);
  });

  test("rejects bad version / truncation / non-Uint8Array", () => {
    const buf = encode({ type: "x" });
    expect(buf[0]).toBe(SCHEMA_PROTOCOL_VERSION);
    const bad = encode({ type: "x" });
    bad[0] = 99;
    expect(() => decode(bad)).toThrow(/unsupported version/);
    expect(() => decode(buf.subarray(0, buf.length - 1))).toThrow(/truncated/);
    expect(() => decode([1, 2, 3])).toThrow(/Uint8Array/);
  });
});

describe("SchemaCodec vs BinaryCodec vs JSON size (spec 038 eval)", () => {
  test("the value-string dictionary beats BinaryCodec (and JSON) on a 40-entity keyframe", () => {
    const entities = {};
    for (let i = 0; i < 40; i++) {
      const id = "player-" + i.toString(36).padStart(6, "0");
      entities[id] = {
        id,
        type: "ship", // a repeated string VALUE — interned by SchemaCodec, inline in BinaryCodec
        x: 1000 + i * 12.3,
        y: -500 + i * 7.8,
        vx: 1.2,
        vy: -3.4,
        heading: 0.57,
        radius: 12,
        name: "NPC " + i,
        shield: 100,
        maxShield: 100,
        armor: 50,
        maxArmor: 50,
      };
    }
    const frame = { type: "state_snapshot", seq: 123, entities };

    const schemaBytes = encode(frame).byteLength;
    const binaryBytes = binEncode(frame).byteLength;
    const jsonBytes = Buffer.byteLength(JSON.stringify(frame), "utf8");

    // RECOMMENDATION (recorded by this test): SchemaCodec < BinaryCodec < JSON
    // for entity-dense frames because the repeated `"ship"` type value (40x) is
    // interned once. The win is modest (the key dictionary already did the heavy
    // lifting) and costs a maintained string table; adopt only if profiling
    // shows broadcast size is the bottleneck. Until then BinaryCodec (015) stays
    // the wire format. (See plan/BACKLOG.md.)
    expect(schemaBytes).toBeLessThan(binaryBytes);
    expect(binaryBytes).toBeLessThan(jsonBytes);
  });
});

describe("SchemaCodec over a StateCodec churn sequence (integration)", () => {
  test("each tick's delta round-trips and the client reconstructs exactly", () => {
    let prev = encodeSnapshot([]);
    let clientSnap = { entities: {} };
    const ticks = [
      [{ id: "1", type: "ship", x: 0 }],
      [
        { id: "1", type: "ship", x: 5 },
        { id: "2", type: "ship", x: 9 },
      ],
      [{ id: "2", type: "ship", x: 9, hp: 80 }],
      [{ id: "2", type: "ship", x: 9 }],
    ];
    for (const entities of ticks) {
      const next = encodeSnapshot(entities);
      const framePayload = {
        type: "state_delta",
        seq: 1,
        baseSeq: 0,
        delta: diff(prev, next),
      };
      const decoded = decode(encode(framePayload));
      expect(decoded).toStrictEqual(framePayload);
      clientSnap = applyDelta(clientSnap, decoded.delta);
      expect(clientSnap).toStrictEqual(next);
      prev = next;
    }
  });
});
