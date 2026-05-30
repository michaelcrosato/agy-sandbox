import { encode, decode, BINARY_PROTOCOL_VERSION } from "./BinaryCodec.js";
import { encodeSnapshot, diff, applyDelta } from "./StateCodec.js";

/** Round-trip helper. toStrictEqual so undefined-valued keys are verified. */
function rt(x) {
  return decode(encode(x));
}

describe("BinaryCodec round-trip", () => {
  test("primitives", () => {
    for (const v of [
      null,
      true,
      false,
      0,
      1,
      -1,
      42,
      -42,
      2147483647,
      -2147483647,
    ]) {
      expect(rt(v)).toStrictEqual(v);
    }
  });

  test("floats are bit-exact (matches the JSON float64 path)", () => {
    for (const v of [1234.1, -567.8, 0.1, 3.141592653589793, 1e-9, -1e12]) {
      expect(rt(v)).toBe(v);
    }
  });

  test("strings incl. unicode and empty", () => {
    for (const v of ["", "ship", "Pirate Raider », ☠", "a".repeat(1000)]) {
      expect(rt(v)).toBe(v);
    }
  });

  test("arrays and nested structures", () => {
    expect(rt([])).toStrictEqual([]);
    expect(rt([1, "a", true, null, [2, 3]])).toStrictEqual([
      1,
      "a",
      true,
      null,
      [2, 3],
    ]);
  });

  test("objects with the key dictionary (repeated keys)", () => {
    const frame = {
      type: "state_snapshot",
      seq: 7,
      entities: {
        a: { id: "a", x: 1.5, y: 2.5, type: "ship" },
        b: { id: "b", x: 3.5, y: 4.5, type: "ship" },
      },
    };
    expect(rt(frame)).toStrictEqual(frame);
  });

  test("preserves undefined-valued fields (delta field removal)", () => {
    const delta = {
      added: [],
      updated: { e1: { shield: undefined, x: 5 } },
      removed: ["e2"],
    };
    const out = rt(delta);
    expect(out).toStrictEqual(delta);
    // Explicit: the removed-field key survives as undefined (JSON would drop it).
    expect(Object.keys(out.updated.e1)).toEqual(["shield", "x"]);
    expect(out.updated.e1.shield).toBeUndefined();
  });

  test("large integers fall back to float64 and still round-trip", () => {
    const big = 9_000_000_000; // > 2^31
    expect(rt(big)).toBe(big);
  });
});

describe("BinaryCodec framing & safety", () => {
  test("leads with the version byte", () => {
    const buf = encode({ type: "x" });
    expect(buf[0]).toBe(BINARY_PROTOCOL_VERSION);
  });

  test("rejects an unsupported version", () => {
    const buf = encode({ type: "x" });
    buf[0] = 99;
    expect(() => decode(buf)).toThrow(/unsupported version/);
  });

  test("rejects a truncated buffer", () => {
    const buf = encode({ type: "state_snapshot", seq: 1, entities: {} });
    expect(() => decode(buf.subarray(0, buf.length - 2))).toThrow(/truncated/);
  });

  test("rejects a non-Uint8Array", () => {
    expect(() => decode([1, 2, 3])).toThrow(/Uint8Array/);
  });
});

describe("BinaryCodec vs JSON payload size (spec 015 DoD)", () => {
  test("is smaller than JSON for a representative 40-entity keyframe", () => {
    const entities = {};
    for (let i = 0; i < 40; i++) {
      const id = "player-" + i.toString(36).padStart(6, "0");
      entities[id] = {
        id,
        type: "ship",
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

    const binaryBytes = encode(frame).byteLength;
    const jsonBytes = Buffer.byteLength(JSON.stringify(frame), "utf8");

    expect(binaryBytes).toBeLessThan(jsonBytes);
  });
});

describe("BinaryCodec over a StateCodec churn sequence (integration)", () => {
  test("each tick's frame round-trips and reconstructs the snapshot", () => {
    let prev = encodeSnapshot([]);
    let clientSnap = { entities: {} };

    const ticks = [
      [{ id: "1", x: 0 }],
      [
        { id: "1", x: 5 },
        { id: "2", x: 9 },
      ],
      [{ id: "2", x: 9, hp: 80 }], // 1 removed, 2 updated
      [{ id: "2", x: 9 }], // hp field removed
    ];

    for (const entities of ticks) {
      const next = encodeSnapshot(entities);
      const delta = diff(prev, next);
      const framePayload = { type: "state_delta", seq: 1, baseSeq: 0, delta };

      // Send the frame through the binary wire and back.
      const decoded = decode(encode(framePayload));
      expect(decoded).toStrictEqual(framePayload);

      // The receiver reconstructs exactly what the server holds.
      clientSnap = applyDelta(clientSnap, decoded.delta);
      expect(clientSnap).toStrictEqual(next);
      prev = next;
    }
  });
});
