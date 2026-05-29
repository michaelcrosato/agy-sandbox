import { createRegistry } from "./metrics.js";

describe("metrics.createRegistry (spec 010)", () => {
  test("counters increment (default +1 and custom)", () => {
    const r = createRegistry({ now: () => 0 });
    r.inc("hits");
    r.inc("hits");
    r.inc("bytes", 1024);
    expect(r.snapshot().counters).toEqual({ hits: 2, bytes: 1024 });
  });

  test("gauges hold the latest value", () => {
    const r = createRegistry({ now: () => 0 });
    r.gauge("clients", 3);
    r.gauge("clients", 5);
    expect(r.snapshot().gauges.clients).toBe(5);
  });

  test("observations aggregate count/sum/avg/min/max", () => {
    const r = createRegistry({ now: () => 0 });
    r.observe("tickMs", 10);
    r.observe("tickMs", 20);
    r.observe("tickMs", 30);
    const o = r.snapshot().observations.tickMs;
    expect(o).toEqual({ count: 3, sum: 60, avg: 20, min: 10, max: 30 });
  });

  test("ignores non-finite inputs", () => {
    const r = createRegistry({ now: () => 0 });
    r.inc("x", NaN);
    r.gauge("g", Infinity);
    r.observe("o", NaN);
    const s = r.snapshot();
    expect(s.counters.x).toBe(0);
    expect(s.gauges.g).toBe(0);
    expect(s.observations.o).toBeUndefined();
  });

  test("snapshot is a plain JSON-safe object stamped with now()", () => {
    const r = createRegistry({ now: () => 12345 });
    r.inc("a");
    const s = r.snapshot();
    expect(s.ts).toBe(12345);
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});
