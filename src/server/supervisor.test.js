import { planWorkers } from "./supervisor.js";

describe("Supervisor planWorkers (spec 019c)", () => {
  test("spawns all missing shards when cluster is completely empty", () => {
    const plan = planWorkers({
      shardCount: 3,
      liveWorkers: [],
    });
    expect(plan.spawn).toEqual([0, 1, 2]);
    expect(plan.terminate).toEqual([]);
  });

  test("does not spawn or terminate anything when all shards are covered exactly once", () => {
    const liveWorkers = [
      { id: "w-1", shardIndex: 0 },
      { id: "w-2", shardIndex: 1 },
      { id: "w-3", shardIndex: 2 },
    ];
    const plan = planWorkers({
      shardCount: 3,
      liveWorkers,
    });
    expect(plan.spawn).toEqual([]);
    expect(plan.terminate).toEqual([]);
  });

  test("terminates redundant duplicate workers assigned to the same shard index", () => {
    const liveWorkers = [
      { id: "w-1", shardIndex: 0 },
      { id: "w-2", shardIndex: 0 }, // redundant duplicate
      { id: "w-3", shardIndex: 1 },
    ];
    const plan = planWorkers({
      shardCount: 2,
      liveWorkers,
    });
    expect(plan.spawn).toEqual([]);
    expect(plan.terminate).toEqual(["w-2"]);
  });

  test("terminates out-of-bound workers if the shardCount is down-scaled", () => {
    const liveWorkers = [
      { id: "w-1", shardIndex: 0 },
      { id: "w-2", shardIndex: 1 },
      { id: "w-3", shardIndex: 2 }, // now out of bounds
    ];
    const plan = planWorkers({
      shardCount: 2,
      liveWorkers,
    });
    expect(plan.spawn).toEqual([]);
    expect(plan.terminate).toEqual(["w-3"]);
  });

  test("spawns only the missing/crashed worker shard", () => {
    const liveWorkers = [
      { id: "w-1", shardIndex: 0 },
      // Shard 1 crashed
      { id: "w-3", shardIndex: 2 },
    ];
    const plan = planWorkers({
      shardCount: 3,
      liveWorkers,
    });
    expect(plan.spawn).toEqual([1]);
    expect(plan.terminate).toEqual([]);
  });
});
