import { describe, test, expect } from "vitest";
import {
  assignShard,
  hashString,
  RoomRegistry,
  routeConnection,
  planDrain,
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

describe("RoomRegistry lease/TTL capabilities (spec 019e)", () => {
  test("claims room with an active lease and prevents other nodes from claiming", () => {
    const reg = new RoomRegistry();
    const now = 1000;
    // Claim for node-1 expiring at t=2000
    expect(reg.claim("room-A", "node-1", 2000, now)).toBe(true);
    expect(reg.owner("room-A")).toBe("node-1");

    // Another node trying to claim before expiry should fail
    expect(reg.claim("room-A", "node-2", 3000, now)).toBe(false);
    expect(reg.owner("room-A")).toBe("node-1");
  });

  test("allows another node to claim if lease has expired", () => {
    const reg = new RoomRegistry();
    // Claim for node-1 expiring at t=2000
    expect(reg.claim("room-A", "node-1", 2000, 1000)).toBe(true);

    // Another node claims at t=2500 (since 2000 < 2500)
    expect(reg.claim("room-A", "node-2", 4000, 2500)).toBe(true);
    expect(reg.owner("room-A")).toBe("node-2");
  });

  test("reaps expired leases while keeping active ones", () => {
    const reg = new RoomRegistry();
    reg.claim("room-A", "node-1", 2000); // active
    reg.claim("room-B", "node-2", 1500); // expired
    reg.claim("room-C", "node-3"); // eternal / no lease

    const reaped = reg.reapExpired(1800);
    expect(reaped).toBe(1);

    expect(reg.owner("room-A")).toBe("node-1");
    expect(reg.owner("room-B")).toBeNull();
    expect(reg.owner("room-C")).toBe("node-3");
  });

  test("serializes and restores lease metadata accurately", () => {
    const reg = new RoomRegistry();
    reg.claim("room-A", "node-1", 2000);
    reg.claim("room-B", "node-2");

    const snapshot = reg.serialize();
    expect(snapshot).toEqual({
      "room-A": { nodeId: "node-1", expiresAt: 2000 },
      "room-B": "node-2",
    });

    const restored = RoomRegistry.fromJSON(snapshot);
    expect(restored.owner("room-A")).toBe("node-1");
    expect(restored.owner("room-B")).toBe("node-2");
    expect(restored.isOwned("room-A", 2500)).toBe(false); // check dynamic expiry works after restore!
  });
});

describe("planDrain stateless rebalancing (spec 019f)", () => {
  test("plans transfers of all rooms owned by draining node to active peers", () => {
    const reg = new RoomRegistry();
    reg.claim("room-A", "node-0");
    reg.claim("room-B", "node-0");
    reg.claim("room-C", "node-1"); // shouldn't move, hosted on peer node-1

    const transfers = planDrain({
      drainingNodeId: "node-0",
      registry: reg,
      activeNodeIds: ["node-0", "node-1", "node-2"],
    });

    // Transfers should move room-A and room-B to either node-1 or node-2
    expect(transfers).toHaveLength(2);
    expect(transfers[0].fromNode).toBe("node-0");
    expect(["node-1", "node-2"]).toContain(transfers[0].toNode);
    expect(transfers[1].fromNode).toBe("node-0");
    expect(["node-1", "node-2"]).toContain(transfers[1].toNode);

    // Assert that the room C remains untouched on node-1
    const movingRoomIds = transfers.map((t) => t.roomId);
    expect(movingRoomIds).toContain("room-A");
    expect(movingRoomIds).toContain("room-B");
    expect(movingRoomIds).not.toContain("room-C");
  });

  test("returns empty list if there are no peer targets", () => {
    const reg = new RoomRegistry();
    reg.claim("room-A", "node-0");

    const transfers = planDrain({
      drainingNodeId: "node-0",
      registry: reg,
      activeNodeIds: ["node-0"],
    });

    expect(transfers).toEqual([]);
  });
});
