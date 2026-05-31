import { DeltaStateCodec } from "./DeltaStateCodec.js";

describe("DeltaStateCodec (spec 072)", () => {
  test("encodeDelta without baseline returns full snapshot", () => {
    const state = {
      frame: 100,
      entities: {
        "ship-1": { id: "ship-1", type: "ship", x: 10, y: 20 },
      },
    };

    const delta = DeltaStateCodec.encodeDelta(state, null);

    expect(delta.frame).toBe(100);
    expect(delta.baselineFrame).toBeNull();
    expect(delta.entities["ship-1"]).toEqual(state.entities["ship-1"]);
    expect(delta.deleted).toEqual([]);
  });

  test("encodeDelta with baseline computes changes and deletions", () => {
    const baseline = {
      frame: 100,
      entities: {
        "ship-1": { id: "ship-1", type: "ship", x: 10, y: 20, shield: 100 },
        "planet-1": { id: "planet-1", type: "planet", x: 100, y: 100 },
      },
    };

    const current = {
      frame: 105,
      entities: {
        // ship-1 moved and shield dropped
        "ship-1": { id: "ship-1", type: "ship", x: 12, y: 20, shield: 80 },
        // planet-1 unchanged (should not be in delta)
        "planet-1": { id: "planet-1", type: "planet", x: 100, y: 100 },
        // ship-2 is brand new
        "ship-2": { id: "ship-2", type: "ship", x: 50, y: 50 },
      },
    };

    const delta = DeltaStateCodec.encodeDelta(current, baseline);

    expect(delta.frame).toBe(105);
    expect(delta.baselineFrame).toBe(100);

    // ship-1 delta should only have id, x, and shield (type and y are unchanged)
    expect(delta.entities["ship-1"]).toEqual({
      id: "ship-1",
      x: 12,
      shield: 80,
    });

    // planet-1 should be fully omitted from the delta
    expect(delta.entities["planet-1"]).toBeUndefined();

    // ship-2 should be fully included
    expect(delta.entities["ship-2"]).toEqual(current.entities["ship-2"]);
  });

  test("encodeDelta captures deleted entities", () => {
    const baseline = {
      frame: 100,
      entities: {
        "ship-1": { id: "ship-1" },
        "ship-2": { id: "ship-2" },
      },
    };

    const current = {
      frame: 105,
      entities: {
        "ship-1": { id: "ship-1" },
      },
    };

    const delta = DeltaStateCodec.encodeDelta(current, baseline);
    expect(delta.deleted).toEqual(["ship-2"]);
  });

  test("decodeDelta reconstitutes the original state exactly", () => {
    const baseline = {
      frame: 100,
      entities: {
        "ship-1": { id: "ship-1", type: "ship", x: 10, y: 20, shield: 100 },
        "ship-2": { id: "ship-2", type: "ship", x: 40, y: 40 },
      },
    };

    const current = {
      frame: 105,
      entities: {
        // ship-1 modified
        "ship-1": { id: "ship-1", type: "ship", x: 15, y: 20, shield: 50 },
        // ship-2 deleted
        // ship-3 new
        "ship-3": { id: "ship-3", type: "ship", x: 99, y: 99 },
      },
    };

    const delta = DeltaStateCodec.encodeDelta(current, baseline);
    const decoded = DeltaStateCodec.decodeDelta(delta, baseline);

    expect(decoded.frame).toBe(105);
    expect(decoded.entities).toEqual(current.entities);
  });
});
