import { describe, expect, test } from "vitest";
import {
  EntityInterpolator,
  lerp,
  lerpAngle,
  shortestArc,
} from "../Interpolator.js";

// ── Pure math helpers ────────────────────────────────────────────────────────

describe("lerp", () => {
  test("returns a when t=0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  test("returns b when t=1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  test("returns midpoint when t=0.5", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  test("handles negative values", () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

describe("shortestArc", () => {
  test("same angle yields 0", () => {
    expect(shortestArc(0, 0)).toBeCloseTo(0);
  });

  test("quarter turn positive", () => {
    expect(shortestArc(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  test("wraps around past PI to take the short route", () => {
    // From 170° to -170° (= +190° or -170°) → shortcut is -20° = -0.349 rad
    const from = (170 * Math.PI) / 180;
    const to = (-170 * Math.PI) / 180;
    const arc = shortestArc(from, to);
    expect(arc).toBeCloseTo((-340 * Math.PI) / 180 + 2 * Math.PI, 5);
    // More intuitively: the shortest arc is -20°
    expect(Math.abs(arc)).toBeLessThanOrEqual(Math.PI);
  });

  test("reverse direction", () => {
    expect(shortestArc(Math.PI / 4, -Math.PI / 4)).toBeCloseTo(-Math.PI / 2);
  });
});

describe("lerpAngle", () => {
  test("returns start at t=0", () => {
    expect(lerpAngle(1.0, 2.0, 0)).toBeCloseTo(1.0);
  });

  test("returns end at t=1", () => {
    expect(lerpAngle(1.0, 2.0, 1)).toBeCloseTo(2.0);
  });

  test("crosses the +PI/-PI boundary via short arc", () => {
    const a = (170 * Math.PI) / 180; // ~2.967 rad
    const b = (-170 * Math.PI) / 180; // ~-2.967 rad
    const mid = lerpAngle(a, b, 0.5);
    // Midpoint should be at 180° (PI or -PI)
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.01);
  });
});

// ── EntityInterpolator ──────────────────────────────────────────────────────

describe("EntityInterpolator", () => {
  test("returns null for unknown entity", () => {
    const interp = new EntityInterpolator();
    expect(interp.getInterpolated("nope", 1000)).toBeNull();
  });

  test("returns single snapshot verbatim", () => {
    const interp = new EntityInterpolator({ bufferDelay: 100 });
    interp.push("a", 1000, 50, 60, 1.0);
    const result = interp.getInterpolated("a", 1100);
    expect(result).toEqual({ x: 50, y: 60, heading: 1.0 });
  });

  test("LERP between two snapshots at midpoint", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0 });
    interp.push("a", 0, 0, 0, 0);
    interp.push("a", 100, 100, 200, Math.PI / 2);

    const result = interp.getInterpolated("a", 50);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(100);
    expect(result.heading).toBeCloseTo(Math.PI / 4);
  });

  test("respects bufferDelay offset", () => {
    const interp = new EntityInterpolator({ bufferDelay: 100 });
    interp.push("a", 0, 0, 0, 0);
    interp.push("a", 100, 100, 100, 0);

    // now=150, renderTime=150-100=50 → midpoint
    const result = interp.getInterpolated("a", 150);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(50);
  });

  test("clamps to earliest snapshot if renderTime is before history", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0 });
    interp.push("a", 100, 10, 20, 0.5);
    interp.push("a", 200, 30, 40, 1.0);

    const result = interp.getInterpolated("a", 50);
    expect(result).toEqual({ x: 10, y: 20, heading: 0.5 });
  });

  test("extrapolates past latest snapshot (capped)", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0 });
    interp.push("a", 0, 0, 0, 0);
    interp.push("a", 100, 100, 0, 0);

    // renderTime=150, overshoot=50, capped to 50 (0.5 * segDt=100)
    // t = 50/100 = 0.5, extrapolated x = 100 + (100-0)*0.5 = 150
    const result = interp.getInterpolated("a", 150);
    expect(result.x).toBeCloseTo(150);
    expect(result.y).toBeCloseTo(0);
  });

  test("extrapolation is capped to prevent runaway", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0 });
    interp.push("a", 0, 0, 0, 0);
    interp.push("a", 100, 100, 0, 0);

    // renderTime=9999 → overshoot capped to segDt*0.5 = 50
    const result = interp.getInterpolated("a", 9999);
    expect(result.x).toBeCloseTo(150); // 100 + 100*0.5
  });

  test("trims history to maxHistory", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0, maxHistory: 3 });
    for (let i = 0; i < 10; i++) {
      interp.push("a", i * 100, i * 10, 0, 0);
    }
    expect(interp.histories.get("a").length).toBe(3);
  });

  test("remove() clears entity history", () => {
    const interp = new EntityInterpolator();
    interp.push("a", 0, 0, 0, 0);
    interp.remove("a");
    expect(interp.getInterpolated("a", 0)).toBeNull();
  });

  test("clear() removes all histories", () => {
    const interp = new EntityInterpolator();
    interp.push("a", 0, 0, 0, 0);
    interp.push("b", 0, 1, 1, 1);
    interp.clear();
    expect(interp.histories.size).toBe(0);
  });

  test("prune() removes stale entities", () => {
    const interp = new EntityInterpolator();
    interp.push("old", 100, 0, 0, 0);
    interp.push("new", 500, 0, 0, 0);
    interp.prune(300);
    expect(interp.histories.has("old")).toBe(false);
    expect(interp.histories.has("new")).toBe(true);
  });

  test("interpolates heading across the PI boundary correctly", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0 });
    const a = (170 * Math.PI) / 180;
    const b = (-170 * Math.PI) / 180;
    interp.push("a", 0, 0, 0, a);
    interp.push("a", 100, 0, 0, b);

    const mid = interp.getInterpolated("a", 50);
    // Shortest arc midpoint should be at ±PI (180°)
    expect(Math.abs(Math.abs(mid.heading) - Math.PI)).toBeLessThan(0.02);
  });

  test("handles multiple entities independently", () => {
    const interp = new EntityInterpolator({ bufferDelay: 0 });
    interp.push("a", 0, 0, 0, 0);
    interp.push("a", 100, 100, 0, 0);
    interp.push("b", 0, 0, 0, 0);
    interp.push("b", 100, 0, 200, 0);

    const ra = interp.getInterpolated("a", 50);
    const rb = interp.getInterpolated("b", 50);
    expect(ra.x).toBeCloseTo(50);
    expect(ra.y).toBeCloseTo(0);
    expect(rb.x).toBeCloseTo(0);
    expect(rb.y).toBeCloseTo(100);
  });
});
