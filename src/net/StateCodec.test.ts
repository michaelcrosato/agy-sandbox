import { describe, test, expect } from "vitest";
import { encodeSnapshot, diff, applyDelta } from "./StateCodec.js";

// Hand-built entity factories — no Math.random, no time-based fields, so every
// assertion stays reproducible across runs and machines.
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

function cargoPod(id, overrides = {}) {
  return {
    id,
    type: "cargo_pod",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    radius: 6,
    resourceType: "minerals",
    amount: 1,
    ...overrides,
  };
}

function warpGate(id, overrides = {}) {
  return {
    id,
    type: "warp_gate",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    radius: 45,
    name: "Stargate",
    sector: "core",
    targetSector: "frontier",
    targetPosition: { x: 17000, y: 20000 },
    ...overrides,
  };
}

describe("encodeSnapshot", () => {
  test("returns an empty snapshot for an empty entity list", () => {
    expect(encodeSnapshot([])).toEqual({ entities: {} });
  });

  test("indexes entities by id", () => {
    const snap = encodeSnapshot([ship("a"), cargoPod("b")]);
    expect(Object.keys(snap.entities).sort()).toEqual(["a", "b"]);
    expect(snap.entities.a.type).toBe("ship");
    expect(snap.entities.b.type).toBe("cargo_pod");
  });

  test("deep-clones entities so later mutation does not leak in", () => {
    const original = ship("a", { shield: 100 });
    const snap = encodeSnapshot([original]);
    original.shield = 0;
    original.x = 9999;
    expect(snap.entities.a.shield).toBe(100);
    expect(snap.entities.a.x).toBe(0);
  });

  test("clones nested objects (warp_gate.targetPosition)", () => {
    const gate = warpGate("g1");
    const snap = encodeSnapshot([gate]);
    gate.targetPosition.x = -1;
    expect(snap.entities.g1.targetPosition).toEqual({ x: 17000, y: 20000 });
  });

  test("throws if an entity has no id", () => {
    expect(() => encodeSnapshot([{ type: "ship" }])).toThrow(/id/);
  });
});

describe("diff", () => {
  test("identical snapshots produce an empty delta", () => {
    const a = encodeSnapshot([ship("a"), cargoPod("b")]);
    const b = encodeSnapshot([ship("a"), cargoPod("b")]);
    expect(diff(a, b)).toEqual({ added: [], updated: {}, removed: [] });
  });

  test("detects added entities with full payload", () => {
    const prev = encodeSnapshot([ship("a")]);
    const next = encodeSnapshot([ship("a"), cargoPod("b", { amount: 3 })]);
    const delta = diff(prev, next);
    expect(delta.removed).toEqual([]);
    expect(delta.updated).toEqual({});
    expect(delta.added).toHaveLength(1);
    expect(delta.added[0]).toEqual(next.entities.b);
  });

  test("detects removed entities by id", () => {
    const prev = encodeSnapshot([ship("a"), cargoPod("b")]);
    const next = encodeSnapshot([ship("a")]);
    expect(diff(prev, next)).toEqual({
      added: [],
      updated: {},
      removed: ["b"],
    });
  });

  test("records only changed fields in updated[id]", () => {
    const prev = encodeSnapshot([ship("a", { x: 10, shield: 100 })]);
    const next = encodeSnapshot([ship("a", { x: 25, shield: 80 })]);
    const delta = diff(prev, next);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(delta.updated).toEqual({ a: { x: 25, shield: 80 } });
  });

  test("treats a nested object as a single field — whole value replaced", () => {
    const prev = encodeSnapshot([warpGate("g1")]);
    const next = encodeSnapshot([
      warpGate("g1", { targetPosition: { x: -17200, y: -20000 } }),
    ]);
    const delta = diff(prev, next);
    expect(delta.updated).toEqual({
      g1: { targetPosition: { x: -17200, y: -20000 } },
    });
  });

  test("records a field removed in next so applyDelta can drop it", () => {
    const prev = encodeSnapshot([
      { id: "x", type: "marker", optional: "present" },
    ]);
    const next = encodeSnapshot([{ id: "x", type: "marker" }]);
    const delta = diff(prev, next);
    expect(delta.updated).toHaveProperty("x");
    expect(delta.updated.x).toHaveProperty("optional");
    expect(delta.updated.x.optional).toBeUndefined();
  });

  test("combines adds, removes, and updates in one delta", () => {
    const prev = encodeSnapshot([
      ship("a", { x: 0 }),
      ship("b"),
      cargoPod("c"),
    ]);
    const next = encodeSnapshot([
      ship("a", { x: 50 }), // updated
      // b removed
      cargoPod("c"), // unchanged
      ship("d"), // added
    ]);
    const delta = diff(prev, next);
    expect(delta.added).toHaveLength(1);
    expect(delta.added[0].id).toBe("d");
    expect(delta.removed).toEqual(["b"]);
    expect(delta.updated).toEqual({ a: { x: 50 } });
  });
});

describe("applyDelta", () => {
  test("an empty delta yields an equivalent snapshot", () => {
    const snap = encodeSnapshot([ship("a"), cargoPod("b")]);
    const next = applyDelta(snap, { added: [], updated: {}, removed: [] });
    expect(next).toEqual(snap);
  });

  test("does not mutate its input snapshot", () => {
    const snap = encodeSnapshot([ship("a", { x: 10 })]);
    const before = JSON.parse(JSON.stringify(snap));
    applyDelta(snap, { added: [], updated: { a: { x: 99 } }, removed: [] });
    expect(snap).toEqual(before);
  });

  test("applies removals, updates, and additions together", () => {
    const snap = encodeSnapshot([ship("a", { x: 0 }), ship("b")]);
    const next = applyDelta(snap, {
      added: [cargoPod("c", { amount: 4 })],
      updated: { a: { x: 75 } },
      removed: ["b"],
    });
    expect(Object.keys(next.entities).sort()).toEqual(["a", "c"]);
    expect(next.entities.a.x).toBe(75);
    expect(next.entities.c.amount).toBe(4);
  });

  test("a field with undefined value is dropped from the entity", () => {
    const snap = encodeSnapshot([
      { id: "x", type: "marker", optional: "present" },
    ]);
    const next = applyDelta(snap, {
      added: [],
      updated: { x: { optional: undefined } },
      removed: [],
    });
    expect(
      Object.prototype.hasOwnProperty.call(next.entities.x, "optional"),
    ).toBe(false);
    expect(next.entities.x).toEqual({ id: "x", type: "marker" });
  });
});

describe("round-trip invariant: applyDelta(prev, diff(prev, next)) === next", () => {
  test("identity case — unchanged world", () => {
    const prev = encodeSnapshot([ship("a"), cargoPod("b"), warpGate("g")]);
    const next = encodeSnapshot([ship("a"), cargoPod("b"), warpGate("g")]);
    expect(applyDelta(prev, diff(prev, next))).toEqual(next);
  });

  test("partial updates across multiple entities", () => {
    const prev = encodeSnapshot([
      ship("a", { x: 10, shield: 100 }),
      ship("b", { x: -5, isDisabled: false }),
    ]);
    const next = encodeSnapshot([
      ship("a", { x: 12, shield: 95 }),
      ship("b", { x: -5, isDisabled: true }),
    ]);
    expect(applyDelta(prev, diff(prev, next))).toEqual(next);
  });

  test("adds and removes interleaved", () => {
    const prev = encodeSnapshot([ship("a"), ship("b"), cargoPod("c")]);
    const next = encodeSnapshot([
      ship("a"),
      cargoPod("c"),
      ship("d"),
      cargoPod("e", { resourceType: "luxuries", amount: 2 }),
    ]);
    expect(applyDelta(prev, diff(prev, next))).toEqual(next);
  });

  test("full churn: adds + removes + field updates + nested-value updates", () => {
    const prev = encodeSnapshot([
      ship("a", { x: 0, shield: 100 }),
      ship("b", { x: 200 }),
      warpGate("g1", { targetPosition: { x: 17000, y: 20000 } }),
      cargoPod("c1", { amount: 1 }),
    ]);
    const next = encodeSnapshot([
      ship("a", { x: 50, shield: 70 }),
      // b removed
      warpGate("g1", { targetPosition: { x: -17200, y: -20000 } }),
      cargoPod("c1", { amount: 1 }),
      ship("z", { name: "Pirate Boss Gallows" }),
    ]);
    const delta = diff(prev, next);
    expect(applyDelta(prev, delta)).toEqual(next);
  });

  test("sequential delta chain matches sequential keyframes", () => {
    const s0 = encodeSnapshot([ship("a", { x: 0 })]);
    const s1 = encodeSnapshot([ship("a", { x: 10 }), ship("b")]);
    const s2 = encodeSnapshot([ship("a", { x: 20 }), ship("b"), cargoPod("c")]);
    const s3 = encodeSnapshot([ship("a", { x: 30 }), cargoPod("c")]);

    let chained = s0;
    chained = applyDelta(chained, diff(s0, s1));
    expect(chained).toEqual(s1);
    chained = applyDelta(chained, diff(s1, s2));
    expect(chained).toEqual(s2);
    chained = applyDelta(chained, diff(s2, s3));
    expect(chained).toEqual(s3);
  });

  test("clearing the world produces a delta with only removals", () => {
    const prev = encodeSnapshot([ship("a"), ship("b"), cargoPod("c")]);
    const next = encodeSnapshot([]);
    const delta = diff(prev, next);
    expect(delta.added).toEqual([]);
    expect(delta.updated).toEqual({});
    expect(delta.removed.sort()).toEqual(["a", "b", "c"]);
    expect(applyDelta(prev, delta)).toEqual(next);
  });

  test("populating an empty world produces a delta with only additions", () => {
    const prev = encodeSnapshot([]);
    const next = encodeSnapshot([ship("a"), cargoPod("b")]);
    const delta = diff(prev, next);
    expect(delta.removed).toEqual([]);
    expect(delta.updated).toEqual({});
    expect(delta.added).toHaveLength(2);
    expect(applyDelta(prev, delta)).toEqual(next);
  });
});
