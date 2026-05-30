import { roomMatches, freeSlots, matchRoom, JoinQueue } from "./matchmaking.js";

describe("matchmaking.roomMatches (spec 036)", () => {
  test("matches on mode and required tags; undefined criteria match anything", () => {
    const room = { id: "r", mode: "pvp", tags: ["ranked", "eu"] };
    expect(roomMatches(room, {})).toBe(true);
    expect(roomMatches(room, { mode: "pvp" })).toBe(true);
    expect(roomMatches(room, { mode: "coop" })).toBe(false);
    expect(roomMatches(room, { tags: ["ranked"] })).toBe(true);
    expect(roomMatches(room, { tags: ["ranked", "us"] })).toBe(false);
  });
});

describe("matchmaking.freeSlots", () => {
  test("computes capacity headroom; unbounded without maxPlayers", () => {
    expect(freeSlots({ maxPlayers: 8, players: 3 })).toBe(5);
    expect(freeSlots({ maxPlayers: 8, players: 8 })).toBe(0);
    expect(freeSlots({ maxPlayers: 8, players: 99 })).toBe(0); // never negative
    expect(freeSlots({ players: 5 })).toBe(Infinity);
  });
});

describe("matchmaking.matchRoom", () => {
  test("creates a new room when nothing matches the criteria", () => {
    const rooms = [{ id: "a", mode: "coop", maxPlayers: 4, players: 0 }];
    expect(matchRoom(rooms, { mode: "pvp" })).toEqual({
      action: "create",
      roomId: null,
    });
    expect(matchRoom([], { mode: "pvp" })).toEqual({
      action: "create",
      roomId: null,
    });
  });

  test("joins the FULLEST matching room that still has a slot (fill before fragmenting)", () => {
    const rooms = [
      { id: "empty", mode: "pvp", maxPlayers: 8, players: 1 }, // 7 free
      { id: "filling", mode: "pvp", maxPlayers: 8, players: 6 }, // 2 free — fullest joinable
      { id: "full", mode: "pvp", maxPlayers: 8, players: 8 }, // 0 free
    ];
    expect(matchRoom(rooms, { mode: "pvp" })).toEqual({
      action: "join",
      roomId: "filling",
    });
  });

  test("queues when matching rooms exist but every one is full", () => {
    const rooms = [
      { id: "a", mode: "pvp", maxPlayers: 4, players: 4 },
      { id: "b", mode: "pvp", maxPlayers: 4, players: 4 },
    ];
    expect(matchRoom(rooms, { mode: "pvp" })).toEqual({
      action: "queue",
      roomId: null,
    });
  });

  test("respects tags when choosing a room", () => {
    const rooms = [
      { id: "us", mode: "pvp", maxPlayers: 8, players: 2, tags: ["us"] },
      { id: "eu", mode: "pvp", maxPlayers: 8, players: 2, tags: ["eu"] },
    ];
    expect(matchRoom(rooms, { mode: "pvp", tags: ["eu"] })).toEqual({
      action: "join",
      roomId: "eu",
    });
  });
});

describe("matchmaking.JoinQueue (FIFO admit-on-slot)", () => {
  test("enqueues, reports size, and admits in arrival order as slots free", () => {
    const q = new JoinQueue();
    expect(q.enqueue("alice")).toBe(1);
    expect(q.enqueue("bob")).toBe(2);
    expect(q.enqueue("carol")).toBe(3);
    expect(q.size).toBe(3);

    expect(q.admit(1)).toEqual(["alice"]); // one slot freed
    expect(q.size).toBe(2);
    expect(q.admit(5)).toEqual(["bob", "carol"]); // more slots than waiting
    expect(q.size).toBe(0);
    expect(q.admit(1)).toEqual([]); // empty queue
  });

  test("removes a disconnected client without disturbing FIFO order", () => {
    const q = new JoinQueue();
    q.enqueue("alice");
    q.enqueue("bob");
    q.enqueue("carol");
    expect(q.remove("bob")).toBe(true);
    expect(q.remove("nobody")).toBe(false);
    expect(q.admit(2)).toEqual(["alice", "carol"]);
  });
});
