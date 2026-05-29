import { DEFAULT_BACKPRESSURE_OPTIONS, sendDecision } from "./backpressure.js";

const SOFT = DEFAULT_BACKPRESSURE_OPTIONS.softLimit;
const HARD = DEFAULT_BACKPRESSURE_OPTIONS.hardLimit;

describe("backpressure.sendDecision (spec 004)", () => {
  test("DEFAULT_BACKPRESSURE_OPTIONS is frozen with soft < hard", () => {
    expect(Object.isFrozen(DEFAULT_BACKPRESSURE_OPTIONS)).toBe(true);
    expect(SOFT).toBeLessThan(HARD);
  });

  test("below the soft limit always sends (delta or keyframe)", () => {
    expect(sendDecision(0)).toBe("send");
    expect(sendDecision(SOFT - 1, { isKeyframe: false })).toBe("send");
    expect(sendDecision(SOFT - 1, { isKeyframe: true })).toBe("send");
  });

  test("at/above soft limit: skip deltas, still send keyframes", () => {
    expect(sendDecision(SOFT, { isKeyframe: false })).toBe("skip");
    expect(sendDecision(SOFT, { isKeyframe: true })).toBe("send");
    expect(sendDecision(HARD - 1, { isKeyframe: false })).toBe("skip");
    expect(sendDecision(HARD - 1, { isKeyframe: true })).toBe("send");
  });

  test("at/above hard limit always drops, even keyframes", () => {
    expect(sendDecision(HARD, { isKeyframe: true })).toBe("drop");
    expect(sendDecision(HARD + 1, { isKeyframe: false })).toBe("drop");
  });

  test("non-finite bufferedAmount is treated as 0 (send)", () => {
    expect(sendDecision(NaN)).toBe("send");
    expect(sendDecision(undefined)).toBe("send");
  });

  test("respects custom limits", () => {
    expect(sendDecision(100, { softLimit: 50, hardLimit: 200 })).toBe("skip");
    expect(sendDecision(300, { softLimit: 50, hardLimit: 200 })).toBe("drop");
  });
});
