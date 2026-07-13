/**
 * metrics (spec 010) — a tiny, dependency-free runtime metrics registry:
 * counters (monotonic), gauges (point-in-time), and observations (count/sum/
 * avg/min/max for things like tick duration). `snapshot()` returns a plain
 * JSON-safe object for a `/metrics` endpoint. Pure aside from its own state;
 * inject `now` for deterministic tests.
 */

/**
 * @param {Object} [options]
 * @param {() => number} [options.now] - Clock (ms) used to stamp snapshots.
 * @returns {{inc:Function, gauge:Function, observe:Function, snapshot:Function}}
 */
export function createRegistry({ now = () => Date.now() } = {}) {
  const counters = new Map();
  const gauges = new Map();
  const observations = new Map();

  return {
    /** Increment a monotonic counter (default +1). */
    inc(name, by = 1) {
      const n = Number.isFinite(by) ? by : 0;
      counters.set(name, (counters.get(name) || 0) + n);
    },
    /** Set a point-in-time gauge. */
    gauge(name, value) {
      gauges.set(name, Number.isFinite(value) ? value : 0);
    },
    /** Record an observation into a count/sum/min/max aggregate. */
    observe(name, value) {
      if (!Number.isFinite(value)) return;
      const o = observations.get(name) || {
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
      };
      o.count += 1;
      o.sum += value;
      if (value < o.min) o.min = value;
      if (value > o.max) o.max = value;
      observations.set(name, o);
    },
    /** Plain JSON-safe snapshot of all metrics. */
    snapshot() {
      const obs = {};
      for (const [k, o] of observations) {
        obs[k] = {
          count: o.count,
          sum: o.sum,
          avg: o.count ? o.sum / o.count : 0,
          min: o.min === Infinity ? 0 : o.min,
          max: o.max === -Infinity ? 0 : o.max,
        };
      }
      return {
        ts: now(),
        counters: Object.fromEntries(counters),
        gauges: Object.fromEntries(gauges),
        observations: obs,
      };
    },
  };
}
