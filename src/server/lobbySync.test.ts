import { describe, it, expect } from "vitest";
import {
  buildLobbyRoomsList,
  broadcastLobbySync,
  sendLobbyList,
} from "./lobbySync.js";

describe("lobbySync module (Spec-042)", () => {
  it("buildLobbyRoomsList extracts metadata fields cleanly from room instances", () => {
    const mockRoom = {
      metadata() {
        return {
          id: "sector-1",
          name: "Valkyrie Depot",
          players: 3,
          mode: "coop",
          maxPlayers: 10,
          tags: ["core"],
        };
      },
    };

    const instances = new Map([["sector-1", mockRoom]]);

    const result = buildLobbyRoomsList(instances);
    expect(result).toEqual([
      {
        id: "sector-1",
        name: "Valkyrie Depot",
        playersCount: 3,
        mode: "coop",
        maxPlayers: 10,
        tags: ["core"],
      },
    ]);
  });

  it("broadcastLobbySync dispatches rooms list to idle lobby clients", () => {
    const mockRoom = {
      metadata() {
        return {
          id: "sector-1",
          name: "Valkyrie Depot",
          players: 1,
          mode: "public",
          maxPlayers: 16,
          tags: [],
        };
      },
    };

    const instances = new Map([["sector-1", mockRoom]]);

    let sentMessage = null;
    const mockClient = {
      roomId: null, // in lobby
      ws: {
        readyState: 1, // OPEN
        send(str) {
          sentMessage = JSON.parse(str);
        },
      },
    };

    const clients = new Map([["c1", mockClient]]);

    broadcastLobbySync(instances, clients);
    expect(sentMessage).not.toBeNull();
    expect(sentMessage.type).toBe("lobby_sync");
    expect(sentMessage.rooms.length).toBe(1);
    expect(sentMessage.rooms[0].id).toBe("sector-1");
  });

  it("sendLobbyList sends the rooms list to a single connected client object", () => {
    const mockRoom = {
      metadata() {
        return {
          id: "sector-1",
          name: "Valkyrie Depot",
          players: 1,
          mode: "public",
          maxPlayers: 16,
          tags: [],
        };
      },
    };

    const instances = new Map([["sector-1", mockRoom]]);

    let sentMessage = null;
    const mockClient = {
      send(payload) {
        sentMessage = payload;
      },
    };

    sendLobbyList(mockClient, instances);
    expect(sentMessage).not.toBeNull();
    expect(sentMessage.type).toBe("lobby_sync");
    expect(sentMessage.rooms[0].name).toBe("Valkyrie Depot");
  });
});
