import { describe, test, expect } from "vitest";
import { DEFAULT_HEARTBEAT_MS, selectDeadSockets } from "./heartbeat.js";

describe("heartbeat.selectDeadSockets (spec 003)", () => {
  test("default interval is a sane positive number", () => {
    expect(DEFAULT_HEARTBEAT_MS).toBeGreaterThan(0);
  });

  test("selects only sockets with isAlive === false", () => {
    const live = { id: "a", isAlive: true };
    const dead = { id: "b", isAlive: false };
    const fresh = { id: "c" }; // isAlive unset -> live (just connected)
    const dead2 = { id: "d", isAlive: false };
    const result = selectDeadSockets([live, dead, fresh, dead2]);
    expect(result).toEqual([dead, dead2]);
  });

  test("treats unset/undefined isAlive as live (never reaps a new socket)", () => {
    expect(
      selectDeadSockets([{ id: "x" }, { id: "y", isAlive: undefined }]),
    ).toEqual([]);
  });

  test("accepts a Set (wss.clients) and is empty/edge safe", () => {
    const a = { isAlive: false };
    const b = { isAlive: true };
    expect(selectDeadSockets(new Set([a, b]))).toEqual([a]);
    expect(selectDeadSockets([])).toEqual([]);
    expect(selectDeadSockets(null)).toEqual([]);
    expect(selectDeadSockets(undefined)).toEqual([]);
  });
});
