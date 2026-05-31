import { GalaxyHeartbeat } from "./GalaxyHeartbeat.js";

function planet(name, market, sector) {
  return { name, market: { ...market }, sector };
}

describe("GalaxyHeartbeat.pulse trade-lane diffusion", () => {
  test("a price spike flows outward to a connected neighbor", () => {
    const a = planet("A", { food: 300 });
    const b = planet("B", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: ["B"], B: ["A"] },
      diffusionRate: 0.2,
      equilibriumRate: 0, // isolate diffusion
    });

    hb.pulse();

    // A drifts down toward B, B drifts up toward A — the gap narrows.
    expect(a.market.food).toBeLessThan(300);
    expect(b.market.food).toBeGreaterThan(100);
  });

  test("repeated pulses converge connected systems toward each other", () => {
    const a = planet("A", { food: 300 });
    const b = planet("B", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: ["B"], B: ["A"] },
      diffusionRate: 0.25,
      equilibriumRate: 0,
    });

    for (let i = 0; i < 40; i++) hb.pulse();

    expect(Math.abs(a.market.food - b.market.food)).toBeLessThanOrEqual(1);
  });

  test("disconnected systems do not influence each other", () => {
    const a = planet("A", { food: 300 });
    const b = planet("B", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: [], B: [] },
      equilibriumRate: 0,
    });

    hb.pulse();

    expect(a.market.food).toBe(300);
    expect(b.market.food).toBe(100);
  });

  test("diffusion is order-independent (applied simultaneously)", () => {
    // C sits between a high (A=300) and low (B=0) neighbor; average is 150.
    const a = planet("A", { food: 300 });
    const b = planet("B", { food: 0 });
    const c = planet("C", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b, c],
      lanes: { A: [], B: [], C: ["A", "B"] },
      diffusionRate: 0.5,
      equilibriumRate: 0,
    });

    hb.pulse();

    // C moves 0.5 * (150 - 100) = +25 regardless of neighbor evaluation order.
    expect(c.market.food).toBe(125);
  });
});

describe("GalaxyHeartbeat.pulse equilibrium drift", () => {
  test("an isolated market drifts toward its baseline", () => {
    const a = planet("A", { food: 200 });
    const hb = new GalaxyHeartbeat({
      planets: [a],
      baseMarkets: { A: { food: 100 } },
      lanes: { A: [] },
      diffusionRate: 0,
      equilibriumRate: 0.1,
    });

    hb.pulse();

    expect(a.market.food).toBe(190); // 200 + 0.1*(100-200) = 190
  });

  test("a market already at baseline with no neighbors does not change", () => {
    const a = planet("A", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a],
      baseMarkets: { A: { food: 100 } },
      lanes: { A: [] },
    });

    const changed = hb.pulse();
    expect(changed).toEqual([]);
    expect(a.market.food).toBe(100);
  });
});

describe("GalaxyHeartbeat bookkeeping", () => {
  test("counts pulses and reports changed planet names", () => {
    const a = planet("A", { food: 300 });
    const b = planet("B", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: ["B"], B: ["A"] },
      diffusionRate: 0.2,
      equilibriumRate: 0,
    });

    const changed = hb.pulse();
    expect(hb.pulses).toBe(1);
    expect(changed.sort()).toEqual(["A", "B"]);
  });
});

describe("GalaxyHeartbeat.buildLanesBySector", () => {
  test("connects same-sector and adjacent-sector planets, not distant ones", () => {
    const planets = [
      planet("Sol", { food: 100 }, "core"),
      planet("Valkyrie", { food: 100 }, "core"),
      planet("Polaris", { food: 100 }, "frontier"),
      planet("Rim1", { food: 100 }, "rim"),
    ];
    const lanes = GalaxyHeartbeat.buildLanesBySector(planets, {
      core: ["frontier"],
      frontier: ["core", "rim"],
      rim: ["frontier"],
    });

    expect(lanes["Sol"]).toContain("Valkyrie"); // same sector
    expect(lanes["Sol"]).toContain("Polaris"); // adjacent sector (core->frontier)
    expect(lanes["Sol"]).not.toContain("Rim1"); // core and rim are not adjacent
    expect(lanes["Polaris"].sort()).toEqual(["Rim1", "Sol", "Valkyrie"]);
  });
});

describe("GalaxyHeartbeat NaN hygiene (spec 006)", () => {
  test("a non-finite neighbour price cannot poison diffusion", () => {
    const a = planet("A", { food: NaN });
    const b = planet("B", { food: 100 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: ["B"], B: ["A"] },
      diffusionRate: 0.2,
      equilibriumRate: 0,
    });

    hb.pulse();

    // B must stay finite — A's NaN cannot be averaged into it.
    expect(Number.isFinite(b.market.food)).toBe(true);
    // A's own NaN is healed by the heartbeat economic invariant sentry
    expect(Number.isFinite(a.market.food)).toBe(true);
  });

  test("healthy systems still diffuse when an unrelated commodity is non-finite", () => {
    const a = planet("A", { food: 300, minerals: NaN });
    const b = planet("B", { food: 100, minerals: 50 });
    const hb = new GalaxyHeartbeat({
      planets: [a, b],
      lanes: { A: ["B"], B: ["A"] },
      diffusionRate: 0.2,
      equilibriumRate: 0,
    });

    hb.pulse();

    // food still diffuses normally despite minerals being NaN on A.
    expect(a.market.food).toBeLessThan(300);
    expect(b.market.food).toBeGreaterThan(100);
    expect(Number.isFinite(b.market.minerals)).toBe(true);
  });
});
