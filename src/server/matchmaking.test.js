import {
  roomMatches,
  freeSlots,
  matchRoom,
  JoinQueue,
  matchQueueToRooms,
} from "./matchmaking.js";

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

describe("matchmaking.roomMatches (spec 069: combatRating / MMR)", () => {
  test("matches within rating tolerance (default +/- 20)", () => {
    const room = { id: "r-100", combatRating: 100 };
    expect(roomMatches(room, { combatRating: 100 })).toBe(true);
    expect(roomMatches(room, { combatRating: 115 })).toBe(true);
    expect(roomMatches(room, { combatRating: 85 })).toBe(true);
    expect(roomMatches(room, { combatRating: 125 })).toBe(false); // outside 20 tolerance
    expect(roomMatches(room, { combatRating: 75 })).toBe(false); // outside 20 tolerance
  });

  test("respects custom combatRatingTolerance", () => {
    const room = { id: "r-100", combatRating: 100 };
    expect(
      roomMatches(room, { combatRating: 150, combatRatingTolerance: 60 }),
    ).toBe(true);
    expect(
      roomMatches(room, { combatRating: 150, combatRatingTolerance: 10 }),
    ).toBe(false);
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

  test("respects squad group slot reservations (playerCount)", () => {
    const rooms = [
      { id: "tight", mode: "pvp", maxPlayers: 4, players: 3 }, // 1 slot free
      { id: "spacious", mode: "pvp", maxPlayers: 4, players: 1 }, // 3 slots free
    ];
    // A single player can join the tight room (fullest joinable)
    expect(matchRoom(rooms, { mode: "pvp", playerCount: 1 })).toEqual({
      action: "join",
      roomId: "tight",
    });
    // A squad of 3 players needs the spacious room
    expect(matchRoom(rooms, { mode: "pvp", playerCount: 3 })).toEqual({
      action: "join",
      roomId: "spacious",
    });
    // A squad of 4 players queues because no room has 4 open slots
    expect(matchRoom(rooms, { mode: "pvp", playerCount: 4 })).toEqual({
      action: "queue",
      roomId: null,
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

describe("matchmaking.JoinQueue (spec 069: progressive MMR tolerance expansion)", () => {
  test("progressive tolerance widening expands acceptable rating delta", () => {
    const q = new JoinQueue();
    const baseTime = 1000000;
    q.enqueue("alice", { combatRating: 100, enqueuedAt: baseTime });

    // Initial check (0 seconds elapsed)
    q.updateQueueTolerances(baseTime, 5, 10);
    expect(q.waiting[0].combatRatingTolerance).toBe(20);

    // After 4 seconds (under 5 seconds interval)
    q.updateQueueTolerances(baseTime + 4000, 5, 10);
    expect(q.waiting[0].combatRatingTolerance).toBe(20);

    // After 5 seconds (1 interval elapsed)
    q.updateQueueTolerances(baseTime + 5000, 5, 10);
    expect(q.waiting[0].combatRatingTolerance).toBe(30);

    // After 12 seconds (2 intervals elapsed)
    q.updateQueueTolerances(baseTime + 12000, 5, 10);
    expect(q.waiting[0].combatRatingTolerance).toBe(40);
  });
});

describe("matchmaking.matchQueueToRooms (spec 069: tick-based queue matching)", () => {
  test("admitting enqueued player when tolerance wident sufficiently to match a room", () => {
    const q = new JoinQueue();
    const rooms = [
      {
        id: "room-pro",
        mode: "pvp",
        maxPlayers: 4,
        players: 1,
        combatRating: 200,
      },
    ];
    const baseTime = 1000000;

    // Alice has 100 MMR. She matches on mode, but the room is 200 MMR (diff = 100).
    q.enqueue("alice", {
      mode: "pvp",
      combatRating: 100,
      enqueuedAt: baseTime,
    });

    // At baseTime, tolerance is 20. Rejects match.
    const admissions1 = matchQueueToRooms(q, rooms, baseTime, 5, 20);
    expect(admissions1).toEqual([]);
    expect(q.size).toBe(1);

    // After 20 seconds, tolerance expands by 4 intervals * 20 MMR = +80 MMR tolerance = 100 total MMR tolerance.
    // alice rating = 100, room rating = 200, diff = 100. Should match!
    const admissions2 = matchQueueToRooms(q, rooms, baseTime + 20000, 5, 20);
    expect(admissions2).toEqual([{ client: "alice", roomId: "room-pro" }]);
    expect(q.size).toBe(0);
  });
});
