import { jest } from "@jest/globals";
import { handleConnectionAction } from "./connectionHandlers.js";

describe("connectionHandlers", () => {
  let clientObj;
  let ws;
  let options;

  beforeEach(() => {
    clientObj = {
      id: "p1",
      nickname: "Player1",
      roomId: null,
      send: jest.fn(),
      sendStats: jest.fn(),
    };
    ws = {
      send: jest.fn(),
    };
    options = {
      instances: new Map([
        [
          "public",
          {
            id: "public",
            name: "Public Sector",
            clients: new Map(),
            planets: [],
            engine: { entities: [], addEntity: jest.fn() },
            broadcastNotification: jest.fn(),
            broadcastRosterUpdate: jest.fn(),
            metadata: jest.fn().mockReturnValue({
              id: "public",
              name: "Public Sector",
              players: 0,
              maxPlayers: 50,
              mode: "standard",
              tags: [],
            }),
          },
        ],
      ]),
      clients: new Map(),
      persistentSessions: new Map(),
      persistenceManager: {
        loadPlayer: jest.fn().mockReturnValue(Promise.resolve(null)),
      },
      galacticChronicle: {},
      WORKERS: 1,
      SHARD_INDEX: 0,
      matchmakingQueue: {
        enqueue: jest.fn(),
      },
      joinRoom: jest.fn(),
      sendLobbyList: jest.fn(),
      broadcastLobbySync: jest.fn(),
    };
  });

  describe("join message", () => {
    test("sends lobby list if sessionToken is absent", () => {
      handleConnectionAction(clientObj, { type: "join" }, ws, options);

      expect(options.sendLobbyList).toHaveBeenCalledWith(
        clientObj,
        options.instances,
      );
    });

    test("tries to load player from disk if sessionToken is new after server restart", async () => {
      const wrapped = {
        player: { id: "p-saved", nickname: "SavedPlayer" },
        roomId: "public",
      };
      options.persistenceManager.loadPlayer.mockReturnValue(
        Promise.resolve(wrapped),
      );

      handleConnectionAction(
        clientObj,
        { type: "join", sessionToken: "token-123" },
        ws,
        options,
      );

      // wait for loadPlayer promise to resolve
      await new Promise(process.nextTick);

      expect(options.persistenceManager.loadPlayer).toHaveBeenCalledWith(
        "token-123",
      );
      expect(clientObj.id).toBe("p-saved");
      expect(options.joinRoom).toHaveBeenCalledWith(
        clientObj,
        "public",
        "SavedPlayer",
      );
    });

    test("re-establishes session if sessionToken is active in persistentSessions", () => {
      const sessionClient = {
        id: "p1",
        nickname: "Player1",
        roomId: "public",
        send: jest.fn(),
        sendStats: jest.fn(),
        ship: { id: "ship-1" },
        tutorialCompleted: false,
      };
      options.persistentSessions.set("token-123", sessionClient);

      handleConnectionAction(
        clientObj,
        { type: "join", sessionToken: "token-123" },
        ws,
        options,
      );

      expect(sessionClient.ws).toBe(ws);
      expect(options.clients.get(ws)).toBe(sessionClient);
      expect(sessionClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "init",
          sessionToken: "token-123",
        }),
      );
    });
  });

  describe("quick_join message", () => {
    test("joins the room if matchRoom returns join action", () => {
      handleConnectionAction(
        clientObj,
        { type: "quick_join", mode: "standard" },
        ws,
        options,
      );

      expect(options.joinRoom).toHaveBeenCalled();
      expect(options.broadcastLobbySync).toHaveBeenCalled();
    });

    test("create branch sanitizes malicious mode/tags before storing them (stored-XSS defense)", () => {
      const before = new Set(options.instances.keys());
      // A mode no existing room offers forces matchRoom() into the create branch.
      handleConnectionAction(
        clientObj,
        {
          type: "quick_join",
          nickname: "Pilot",
          mode: "<img src=x onerror=alert(1)>",
          tags: ["<script>evil</script>", "   ", "ok"],
        },
        ws,
        options,
      );

      const newKey = [...options.instances.keys()].find((k) => !before.has(k));
      expect(newKey).toBeDefined();
      const created = options.instances.get(newKey);

      // HTML/injection characters are stripped from the stored metadata...
      expect(created.mode).not.toMatch(/[<>&"'`/\\]/);
      for (const tag of created.tags) {
        expect(tag).not.toMatch(/[<>&"'`/\\]/);
      }
      // ...empty/whitespace-only tags are dropped...
      expect(created.tags).not.toContain("");
      expect(created.tags).toContain("ok");
      expect(options.joinRoom).toHaveBeenCalled();
    });

    test("queues the client when a matching room exists but is full", () => {
      // Make the only matching room report itself as full so matchRoom() queues.
      options.instances.get("public").metadata.mockReturnValue({
        id: "public",
        name: "Public Sector",
        players: 50,
        maxPlayers: 50,
        mode: "standard",
        tags: [],
      });

      handleConnectionAction(
        clientObj,
        { type: "quick_join", nickname: "Pilot", mode: "standard" },
        ws,
        options,
      );

      expect(options.matchmakingQueue.enqueue).toHaveBeenCalled();
      expect(options.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe("create_room message", () => {
    test("rejects empty sector names", () => {
      handleConnectionAction(
        clientObj,
        { type: "create_room", name: "  " },
        ws,
        options,
      );

      expect(clientObj.send).toHaveBeenCalledWith({
        type: "notification",
        message: "Invalid Sector Name!",
        style: "error",
      });
      expect(options.joinRoom).not.toHaveBeenCalled();
    });

    test("creates and joins a new sector room", () => {
      handleConnectionAction(
        clientObj,
        { type: "create_room", name: "Sector 5" },
        ws,
        options,
      );

      expect(options.instances.size).toBe(2); // public + Sector 5
      expect(options.joinRoom).toHaveBeenCalled();
      expect(options.broadcastLobbySync).toHaveBeenCalled();
    });
  });

  describe("join_room message", () => {
    test("joins specified room", () => {
      handleConnectionAction(
        clientObj,
        { type: "join_room", roomId: "public" },
        ws,
        options,
      );

      expect(options.joinRoom).toHaveBeenCalledWith(
        clientObj,
        "public",
        undefined,
      );
      expect(options.broadcastLobbySync).toHaveBeenCalled();
    });
  });
});
