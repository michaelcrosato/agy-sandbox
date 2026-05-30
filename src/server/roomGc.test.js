import { runGcSweep } from "./roomGc.js";

describe("roomGc module (Spec-042)", () => {
  it("reaps inactive custom sectors, invokes teardown loops, and removes presence keys", async () => {
    let destroyCalled = false;
    const mockRoom = {
      name: "Sol Prime",
      lastActivityTime: 1000,
      clients: new Map(),
      destroy() {
        destroyCalled = true;
      },
    };

    const instances = new Map([["room-1", mockRoom]]);

    let gcHookCalledWith = null;
    const reapedIds = await runGcSweep(instances, {
      now: 100000, // far in the future
      workersCount: 1,
      onRoomGc: (id) => {
        gcHookCalledWith = id;
      },
    });

    expect(reapedIds).toEqual(["room-1"]);
    expect(destroyCalled).toBe(true);
    expect(instances.has("room-1")).toBe(false);
    expect(gcHookCalledWith).toBe("room-1");
  });

  it("skips active rooms possessing recently connected pilots", async () => {
    let destroyCalled = false;
    const mockRoom = {
      name: "Sol Prime",
      lastActivityTime: Date.now(),
      clients: new Map([["c1", {}]]), // possesses active pilot connection
      destroy() {
        destroyCalled = true;
      },
    };

    const instances = new Map([["room-1", mockRoom]]);

    const reapedIds = await runGcSweep(instances, {
      now: Date.now(),
      workersCount: 1,
    });

    expect(reapedIds).toEqual([]);
    expect(destroyCalled).toBe(false);
    expect(instances.has("room-1")).toBe(true);
  });
});
