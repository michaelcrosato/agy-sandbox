import {
  assignShard,
  hashString,
  RoomRegistry,
  routeConnection,
} from "./roomRouter.js";

describe("assignShard (spec 019 router)", () => {
  test("is deterministic — same room + shard count yields the same shard", () => {
    for (const room of ["public", "alpha", "room-42", "Rogue's Hollow"]) {
      expect(assignShard(room, 8)).toBe(assignShard(room, 8));
    }
  });

  test("stays within [0, shardCount)", () => {
    for (let i = 0; i < 200; i++) {
      const s = assignShard("room-" + i, 8);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(8);
    }
  });

  test("collapses to shard 0 for single-process / invalid counts", () => {
    expect(assignShard("public", 1)).toBe(0);
    expect(assignShard("public", 0)).toBe(0);
    expect(assignShard("public", -3)).toBe(0);
  });

  test("spreads rooms across all shards (rough balance)", () => {
    const counts = new Array(4).fill(0);
    for (let i = 0; i < 400; i++) counts[assignShard("room-" + i, 4)]++;
    // Every shard gets a non-trivial share — no shard is empty or > 60%.
    for (const c of counts) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(400 * 0.6);
    }
  });

  test("hashString is stable and unsigned", () => {
    expect(hashString("x")).toBe(hashString("x"));
    expect(hashString("x")).toBeGreaterThanOrEqual(0);
  });
});

describe("RoomRegistry (room ownership / presence)", () => {
  test("claims an unowned room and reports the owner", () => {
    const reg = new RoomRegistry();
    expect(reg.isOwned("public")).toBe(false);
    expect(reg.claim("public", "nodeA")).toBe(true);
    expect(reg.owner("public")).toBe("nodeA");
    expect(reg.isOwned("public")).toBe(true);
  });

  test("claim is idempotent for the same owner but rejects a different node", () => {
    const reg = new RoomRegistry();
    reg.claim("public", "nodeA");
    expect(reg.claim("public", "nodeA")).toBe(true); // idempotent
    expect(reg.claim("public", "nodeB")).toBe(false); // already owned
    expect(reg.owner("public")).toBe("nodeA");
  });

  test("only the owner may release", () => {
    const reg = new RoomRegistry();
    reg.claim("public", "nodeA");
    expect(reg.release("public", "nodeB")).toBe(false);
    expect(reg.release("public", "nodeA")).toBe(true);
    expect(reg.owner("public")).toBeNull();
  });

  test("transfers ownership only from the current owner (graceful drain)", () => {
    const reg = new RoomRegistry();
    reg.claim("public", "nodeA");
    expect(reg.transfer("public", "nodeB", "nodeC")).toBe(false); // wrong source
    expect(reg.transfer("public", "nodeA", "nodeB")).toBe(true);
    expect(reg.owner("public")).toBe("nodeB");
  });

  test("lists rooms per node, sorted", () => {
    const reg = new RoomRegistry();
    reg.claim("z", "nodeA");
    reg.claim("a", "nodeA");
    reg.claim("m", "nodeB");
    expect(reg.roomsForNode("nodeA")).toEqual(["a", "z"]);
    expect(reg.roomsForNode("nodeB")).toEqual(["m"]);
    expect(reg.roomsForNode("nodeX")).toEqual([]);
  });

  test("round-trips through serialize/fromJSON (presence via the shared store)", () => {
    const reg = new RoomRegistry();
    reg.claim("public", "nodeA");
    reg.claim("alpha", "nodeB");
    const snapshot = reg.serialize();
    expect(snapshot).toEqual({ public: "nodeA", alpha: "nodeB" });

    const restored = RoomRegistry.fromJSON(snapshot);
    expect(restored.owner("public")).toBe("nodeA");
    expect(restored.owner("alpha")).toBe("nodeB");
  });
});

describe("routeConnection (spec 019d load balancer/router)", () => {
  test("falls back to assignShard for unclaimed rooms", () => {
    const reg = new RoomRegistry();
    const targetIdx = assignShard("myroom", 4);
    const route = routeConnection({
      roomId: "myroom",
      registry: reg,
      shardCount: 4,
    });
    expect(route).toBe(`node-${targetIdx}`);
  });

  test("uses dynamic registry owner if claimed", () => {
    const reg = new RoomRegistry();
    reg.claim("myroom", "node-3");

    // Static hash might route to node-1, but because it is claimed,
    // it must route to node-3!
    const route = routeConnection({
      roomId: "myroom",
      registry: reg,
      shardCount: 4,
    });
    expect(route).toBe("node-3");
  });

  test("returns node-0 if roomId is empty or null", () => {
    expect(routeConnection({ roomId: null, shardCount: 4 })).toBe("node-0");
  });
});
