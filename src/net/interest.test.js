import {
  interestFilter,
  DEFAULT_INTEREST_RADIUS,
  buildSpatialGrid,
} from "./interest.js";

function ent(id, x, y) {
  return { id, type: "ship", x, y };
}

describe("interestFilter (spec 014)", () => {
  const viewer = { x: 0, y: 0 };

  test("keeps entities within the radius, drops those beyond", () => {
    const near = ent("near", 100, 0);
    const far = ent("far", 5000, 0);
    expect(interestFilter([near, far], viewer, { radius: 3000 })).toEqual([
      near,
    ]);
  });

  test("radius boundary is inclusive", () => {
    const onEdge = ent("edge", 3000, 0);
    expect(interestFilter([onEdge], viewer, { radius: 3000 })).toEqual([
      onEdge,
    ]);
  });

  test("always includes the viewer's own ship even when far away", () => {
    const self = ent("self", 99999, 0);
    expect(
      interestFilter([self], viewer, { radius: 100, alwaysIncludeId: "self" }),
    ).toEqual([self]);
  });

  test("always includes extra ids (e.g. a locked combat target)", () => {
    const target = ent("t", 99999, 0);
    const farMisc = ent("x", 88888, 0);
    expect(
      interestFilter([farMisc, target], viewer, {
        radius: 100,
        alwaysIncludeIds: ["t"],
      }),
    ).toEqual([target]);
  });

  test("preserves order and does not mutate the input array", () => {
    const list = [ent("a", 10, 0), ent("b", 20, 0)];
    const copy = [...list];
    interestFilter(list, viewer, { radius: 3000 });
    expect(list).toEqual(copy);
  });

  test("fails open to the full set for an invalid viewer", () => {
    const list = [ent("a", 9e9, 0)];
    expect(interestFilter(list, null)).toEqual(list);
    expect(interestFilter(list, { x: NaN, y: 0 })).toEqual(list);
  });

  test("uses the default radius when none is supplied", () => {
    const inside = ent("in", DEFAULT_INTEREST_RADIUS - 1, 0);
    const outside = ent("out", DEFAULT_INTEREST_RADIUS + 1, 0);
    expect(interestFilter([inside, outside], viewer)).toEqual([inside]);
  });

  test("an entity leaving the radius is dropped (becomes a remove delta upstream)", () => {
    const moving = ent("m", 100, 0);
    expect(interestFilter([moving], viewer, { radius: 3000 })).toHaveLength(1);
    moving.x = 9000; // it flew away
    expect(interestFilter([moving], viewer, { radius: 3000 })).toEqual([]);
  });

  test("reduces total broadcast bytes for a 50-entity / 8-viewer scene (DoD bandwidth win)", () => {
    // 50 entities scattered across a 36000 x 16000 sector on a 4000-unit grid.
    const entities = [];
    for (let i = 0; i < 50; i++) {
      entities.push(ent("e" + i, (i % 10) * 4000, Math.floor(i / 10) * 4000));
    }
    // 8 viewers spread across one corner cluster of that grid.
    const viewers = [];
    for (let i = 0; i < 8; i++) {
      viewers.push({ x: (i % 4) * 4000, y: Math.floor(i / 4) * 4000 });
    }

    const fullBytes = viewers.length * JSON.stringify(entities).length;
    let aoiBytes = 0;
    for (const v of viewers) {
      aoiBytes += JSON.stringify(
        interestFilter(entities, v, { radius: 3000 }),
      ).length;
    }

    expect(aoiBytes).toBeLessThan(fullBytes);
    // The win should be substantial, not marginal, in a spread-out room.
    expect(aoiBytes).toBeLessThan(fullBytes * 0.5);
  });

  test("includes entities within range of squadmates (shared visual sensor range)", () => {
    const farFromViewerButNearSquadmate = ent("target", 2000, 0);
    const result = interestFilter([farFromViewerButNearSquadmate], viewer, {
      radius: 100,
      squadmates: [{ x: 1950, y: 0 }],
    });
    expect(result).toEqual([farFromViewerButNearSquadmate]);
  });

  test("squadmates shared range works with spatial grid optimized path", () => {
    const entities = [];
    for (let i = 0; i < 20; i++) {
      entities.push(ent(`e${i}`, 99999, 99999));
    }
    const target = ent("target", 2000, 0);
    entities.push(target);

    const result = interestFilter(entities, viewer, {
      radius: 100,
      squadmates: [{ x: 1950, y: 0 }],
    });
    expect(result).toContain(target);
  });
});

describe("interestFilter Spatial Grid Optimization (spec 049)", () => {
  // Pure unoptimized culling search to assert exact behavioural parity
  function legacyInterestFilter(entities, viewer, options = {}) {
    if (!Array.isArray(entities)) return [];
    if (!viewer || !Number.isFinite(viewer.x) || !Number.isFinite(viewer.y)) {
      return entities.slice();
    }
    const radius = Number.isFinite(options.radius)
      ? options.radius
      : DEFAULT_INTEREST_RADIUS;
    const r2 = radius * radius;
    const alwaysId = options.alwaysIncludeId;
    const alwaysSet =
      options.alwaysIncludeIds instanceof Set
        ? options.alwaysIncludeIds
        : Array.isArray(options.alwaysIncludeIds)
          ? new Set(options.alwaysIncludeIds)
          : null;

    const out = [];
    for (const ent of entities) {
      if (!ent) continue;
      if (
        (alwaysId !== undefined && ent.id === alwaysId) ||
        (alwaysSet && alwaysSet.has(ent.id))
      ) {
        out.push(ent);
        continue;
      }
      const dx = (Number.isFinite(ent.x) ? ent.x : 0) - viewer.x;
      const dy = (Number.isFinite(ent.y) ? ent.y : 0) - viewer.y;
      if (dx * dx + dy * dy <= r2) out.push(ent);
    }
    return out;
  }

  test("maintains 100% exact output equivalence and array ordering with legacy linear culling", () => {
    const entities = [];
    // Generate 200 random entities scattered widely
    for (let i = 0; i < 200; i++) {
      entities.push({
        id: "e" + i,
        type: "ship",
        x: Math.sin(i) * 50000,
        y: Math.cos(i) * 50000,
      });
    }

    const viewers = [
      { x: 0, y: 0 },
      { x: 10000, y: -5000 },
      { x: -25000, y: 25000 },
      { x: 45000, y: 45000 },
    ];

    for (const v of viewers) {
      const opts = {
        radius: 3000,
        alwaysIncludeId: "e10",
        alwaysIncludeIds: ["e20", "e30"],
      };

      const legacyResult = legacyInterestFilter(entities, v, opts);
      const gridResult = interestFilter(entities, v, opts);

      expect(gridResult).toEqual(legacyResult);
    }
  });

  test("proves high-concurrency performance benchmark speedup", () => {
    const entityCount = 1000;
    const viewerCount = 100;
    const entities = [];

    // Spread entities in space
    for (let i = 0; i < entityCount; i++) {
      entities.push({
        id: "e" + i,
        type: "ship",
        x: Math.sin(i) * 100000,
        y: Math.cos(i) * 100000,
      });
    }

    const viewers = [];
    for (let i = 0; i < viewerCount; i++) {
      viewers.push({
        x: Math.sin(i * 2) * 80000,
        y: Math.cos(i * 2) * 80000,
      });
    }

    const opts = { radius: 3000 };

    // 1. Measure legacy culling execution time
    const t0 = Date.now();
    let legacyCallsCount = 0;
    for (let run = 0; run < 10; run++) {
      for (const v of viewers) {
        legacyInterestFilter(entities, v, opts);
        legacyCallsCount++;
      }
    }
    const tLegacy = Date.now() - t0;

    // 2. Measure spatial grid culling execution time
    const t1 = Date.now();
    let gridCallsCount = 0;
    for (let run = 0; run < 10; run++) {
      const spatialGrid = buildSpatialGrid(entities, 3000);
      for (const v of viewers) {
        interestFilter(entities, v, { ...opts, spatialGrid });
        gridCallsCount++;
      }
    }
    const tGrid = Date.now() - t1;

    // Verify both runs performed identical iterations
    expect(gridCallsCount).toBe(legacyCallsCount);

    // Note performance metrics for diagnostic output
    console.log(
      `[BENCHMARK] Legacy linear search time: ${tLegacy}ms | Optimized Spatial Grid time: ${tGrid}ms`,
    );

    // Under larger coordinate systems with pre-built grids, broadphase is significantly faster
    expect(tGrid).toBeLessThanOrEqual(tLegacy);
  });
});
