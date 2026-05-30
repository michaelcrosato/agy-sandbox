import { GameInstance } from "../engine/GameInstance.js";
import { matchRoom, JoinQueue } from "./matchmaking.js";

/**
 * Spec 036 — matchmaking against LIVE rooms. The pure decisions are covered in
 * matchmaking.test.js; here we drive matchRoom + JoinQueue with real
 * `GameInstance.metadata()` to prove the lobby-side flow: pick a joinable room,
 * queue when the pool is full and admit on a freed slot, and create when no
 * room matches the criteria.
 */

/** Simulates `n` connected clients in a room's clients map. */
function populate(room, n) {
  for (let i = 0; i < n; i++) room.clients.set({ i }, { id: "c" + i });
}

describe("matchmaking against live GameInstance rooms (spec 036)", () => {
  test("selects the fullest joinable room by live metadata", () => {
    const a = new GameInstance("a", "Arena A");
    const b = new GameInstance("b", "Arena B");
    a.maxPlayers = 4;
    b.maxPlayers = 4;
    try {
      populate(a, 1); // 1/4 → 3 free
      populate(b, 3); // 3/4 → 1 free (fullest joinable)
      const rooms = [a.metadata(), b.metadata()];
      expect(matchRoom(rooms, { mode: "standard" })).toEqual({
        action: "join",
        roomId: "b",
      });
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  test("queues when the matching pool is full, then admits on a freed slot", () => {
    const a = new GameInstance("a", "A");
    a.maxPlayers = 1;
    const queue = new JoinQueue();
    try {
      populate(a, 1); // full (1/1)
      expect(matchRoom([a.metadata()], { mode: "standard" }).action).toBe(
        "queue",
      );
      expect(queue.enqueue("late-arrival")).toBe(1);

      // A player leaves → a slot frees → admit the queued client.
      a.clients.clear();
      const meta = a.metadata();
      const freed = meta.maxPlayers - meta.players; // 1
      expect(queue.admit(freed)).toEqual(["late-arrival"]);
      expect(queue.size).toBe(0);
    } finally {
      a.destroy();
    }
  });

  test("creates a new room when no live room matches the criteria's mode", () => {
    const a = new GameInstance("a", "A"); // default mode "standard"
    try {
      expect(matchRoom([a.metadata()], { mode: "hardcore" })).toEqual({
        action: "create",
        roomId: null,
      });
    } finally {
      a.destroy();
    }
  });

  test("metadata reflects live population and graceful defaults", () => {
    const a = new GameInstance("a", "A");
    try {
      const m0 = a.metadata();
      expect(m0.mode).toBe("standard");
      expect(m0.maxPlayers).toBe(50);
      expect(m0.players).toBe(0);
      expect(m0.tags).toEqual([]);
      populate(a, 2);
      expect(a.metadata().players).toBe(2);
    } finally {
      a.destroy();
    }
  });

  test("queued player is automatically admitted when a slot in a matching room becomes free", () => {
    const room = new GameInstance("full-arena", "Full Arena");
    room.maxPlayers = 1;
    populate(room, 1); // 1/1 players, room is full

    const queue = new JoinQueue();
    const candidateClient = {
      ws: { readyState: 1 },
      send(payload) {
        this.lastPayload = payload;
      },
    };

    // Enroll player in queue
    queue.enqueue({
      clientObj: candidateClient,
      criteria: { mode: "standard" },
      nickname: "queued-pilot",
    });

    expect(queue.size).toBe(1);

    // Simulate freeing a slot in the room
    room.clients.clear();
    const meta = room.metadata();
    const free = meta.maxPlayers - meta.players; // 1

    expect(free).toBe(1);

    // The server pops candidate and admits them
    const admitted = queue.admit(free);
    expect(admitted.length).toBe(1);
    expect(admitted[0].nickname).toBe("queued-pilot");
    expect(queue.size).toBe(0);

    admitted[0].clientObj.send({
      type: "match_admitted",
      roomId: room.id,
    });

    expect(candidateClient.lastPayload).toEqual({
      type: "match_admitted",
      roomId: "full-arena",
    });

    room.destroy();
  });

  test("connection drops from queued players safely prune the queue without memory leaks", () => {
    const queue = new JoinQueue();
    const deadClient = {
      ws: { readyState: 3 }, // 3 === CLOSED
      send() {},
    };
    const liveClient = {
      ws: { readyState: 1 }, // 1 === OPEN
      send(payload) {
        this.lastPayload = payload;
      },
    };

    queue.enqueue({
      clientObj: deadClient,
      criteria: { mode: "standard" },
      nickname: "dead-pilot",
    });
    queue.enqueue({
      clientObj: liveClient,
      criteria: { mode: "standard" },
      nickname: "live-pilot",
    });

    expect(queue.size).toBe(2);

    // Simulate active scan and admit logic for 1 free slot
    const room = new GameInstance("free-arena", "Free Arena");
    room.maxPlayers = 2;

    const admitted = [];
    for (let i = 0; i < queue.waiting.length; i++) {
      const candidate = queue.waiting[i];
      if (!candidate.clientObj.ws || candidate.clientObj.ws.readyState !== 1) {
        queue.waiting.splice(i, 1);
        i--;
        continue;
      }
      admitted.push(candidate);
      queue.waiting.splice(i, 1);
      break; // break after admitting 1 live candidate
    }

    expect(admitted.length).toBe(1);
    expect(admitted[0].nickname).toBe("live-pilot");
    expect(queue.size).toBe(0); // both dead and live were popped/pruned!

    room.destroy();
  });
});
