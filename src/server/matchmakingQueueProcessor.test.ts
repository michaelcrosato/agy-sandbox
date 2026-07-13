import { describe, test, expect, beforeEach, vi } from "vitest";
import { processMatchmakingQueueForRoom } from "./matchmakingQueueProcessor.js";
import { JoinQueue } from "./matchmaking.js";

describe("matchmakingQueueProcessor", () => {
  let roomMock;
  let matchmakingQueue;
  let joinRoomMock;
  let broadcastLobbySyncMock;
  let instancesMock;
  let clientsMock;

  beforeEach(() => {
    vi.clearAllMocks();

    roomMock = {
      id: "room-1",
      name: "Sol-Test",
      metadata: vi.fn().mockReturnValue({
        id: "room-1",
        name: "Sol-Test",
        maxPlayers: 5,
        players: 3, // 2 free slots
        mode: "coop",
        tags: ["pve"],
      }),
    };

    matchmakingQueue = new JoinQueue();

    joinRoomMock = vi.fn();
    broadcastLobbySyncMock = vi.fn();
    instancesMock = new Map();
    clientsMock = new Map();
  });

  test("does nothing if there are no free slots in the room", () => {
    roomMock.metadata.mockReturnValue({
      id: "room-1",
      name: "Sol-Test",
      maxPlayers: 3,
      players: 3, // 0 free slots
    });

    const client1 = {
      ws: { readyState: 1 },
      send: vi.fn(),
    };
    matchmakingQueue.enqueue({
      nickname: "PilotA",
      clientObj: client1,
      criteria: {},
    });

    processMatchmakingQueueForRoom(roomMock, {
      matchmakingQueue,
      joinRoom: joinRoomMock,
      broadcastLobbySync: broadcastLobbySyncMock,
      instances: instancesMock,
      clients: clientsMock,
    });

    expect(joinRoomMock).not.toHaveBeenCalled();
    expect(matchmakingQueue.size).toBe(1);
    expect(broadcastLobbySyncMock).not.toHaveBeenCalled();
  });

  test("admits matching candidates from the queue up to the free slots limit", () => {
    const client1 = { ws: { readyState: 1 }, send: vi.fn() };
    const client2 = { ws: { readyState: 1 }, send: vi.fn() };
    const client3 = { ws: { readyState: 1 }, send: vi.fn() };

    matchmakingQueue.enqueue({
      nickname: "PilotA",
      clientObj: client1,
      criteria: { mode: "coop" },
    });
    matchmakingQueue.enqueue({
      nickname: "PilotB",
      clientObj: client2,
      criteria: { mode: "coop" },
    });
    matchmakingQueue.enqueue({
      nickname: "PilotC",
      clientObj: client3,
      criteria: { mode: "coop" },
    });

    // 2 free slots -> should admit A & B, C remains in queue
    processMatchmakingQueueForRoom(roomMock, {
      matchmakingQueue,
      joinRoom: joinRoomMock,
      broadcastLobbySync: broadcastLobbySyncMock,
      instances: instancesMock,
      clients: clientsMock,
    });

    expect(joinRoomMock).toHaveBeenCalledTimes(2);
    expect(joinRoomMock).toHaveBeenNthCalledWith(
      1,
      client1,
      "room-1",
      "PilotA",
    );
    expect(joinRoomMock).toHaveBeenNthCalledWith(
      2,
      client2,
      "room-1",
      "PilotB",
    );

    expect(client1.send).toHaveBeenCalledWith({
      type: "match_admitted",
      roomId: "room-1",
    });
    expect(client2.send).toHaveBeenCalledWith({
      type: "match_admitted",
      roomId: "room-1",
    });
    expect(client3.send).not.toHaveBeenCalled();

    expect(matchmakingQueue.size).toBe(1);
    expect(matchmakingQueue.waiting[0].nickname).toBe("PilotC");
    expect(broadcastLobbySyncMock).toHaveBeenCalledWith(
      instancesMock,
      clientsMock,
    );
  });

  test("prunes candidates from the queue if the socket is closed or missing", () => {
    const client1 = { ws: null, send: vi.fn() }; // missing ws
    const client2 = { ws: { readyState: 3 /* CLOSED */ }, send: vi.fn() }; // closed ws
    const client3 = { ws: { readyState: 1 /* OPEN */ }, send: vi.fn() };

    matchmakingQueue.enqueue({
      nickname: "PilotA",
      clientObj: client1,
      criteria: { mode: "coop" },
    });
    matchmakingQueue.enqueue({
      nickname: "PilotB",
      clientObj: client2,
      criteria: { mode: "coop" },
    });
    matchmakingQueue.enqueue({
      nickname: "PilotC",
      clientObj: client3,
      criteria: { mode: "coop" },
    });

    // Should prune A and B, admit C
    processMatchmakingQueueForRoom(roomMock, {
      matchmakingQueue,
      joinRoom: joinRoomMock,
      broadcastLobbySync: broadcastLobbySyncMock,
      instances: instancesMock,
      clients: clientsMock,
    });

    expect(joinRoomMock).toHaveBeenCalledTimes(1);
    expect(joinRoomMock).toHaveBeenCalledWith(client3, "room-1", "PilotC");
    expect(matchmakingQueue.size).toBe(0);
    expect(broadcastLobbySyncMock).toHaveBeenCalled();
  });

  test("does not admit candidate if room criteria do not match", () => {
    const client1 = { ws: { readyState: 1 }, send: vi.fn() };

    matchmakingQueue.enqueue({
      nickname: "PilotA",
      clientObj: client1,
      criteria: { mode: "pvp" }, // Room is coop
    });

    processMatchmakingQueueForRoom(roomMock, {
      matchmakingQueue,
      joinRoom: joinRoomMock,
      broadcastLobbySync: broadcastLobbySyncMock,
      instances: instancesMock,
      clients: clientsMock,
    });

    expect(joinRoomMock).not.toHaveBeenCalled();
    expect(matchmakingQueue.size).toBe(1);
    expect(broadcastLobbySyncMock).not.toHaveBeenCalled();
  });
});
