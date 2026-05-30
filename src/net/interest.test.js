import { interestFilter, DEFAULT_INTEREST_RADIUS } from "./interest.js";

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
});
