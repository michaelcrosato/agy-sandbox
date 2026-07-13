import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { GameInstance } from "../engine/GameInstance.js";
import { PersistenceManager } from "../persistence/PersistenceManager.js";
import { InMemoryStore } from "../persistence/Store.js";
import { FactionWarCampaign } from "../engine/FactionWarCampaign.js";

describe("Clustered Sync for Faction War Campaign (SPEC-165)", () => {
  let store;
  let persistenceManager;
  let shard0Game;
  let shard1Game;

  beforeEach(() => {
    store = new InMemoryStore();
    persistenceManager = new PersistenceManager({ store });

    // Shard 0 room setup
    shard0Game = new GameInstance("public", "Public Sector");
    shard0Game.factionWarCampaign = new FactionWarCampaign();

    // Shard 1 room setup
    shard1Game = new GameInstance("public", "Public Sector");
    shard1Game.factionWarCampaign = new FactionWarCampaign();
  });

  afterEach(() => {
    shard0Game.destroy?.();
    shard1Game.destroy?.();
  });

  test("PersistenceManager saves and loads campaign state cleanly under faction:campaign:state key", async () => {
    // Modify campaign state on Shard 0
    shard0Game.factionWarCampaign.ticks = 88;
    shard0Game.factionWarCampaign.militaryPower.core.Federation = 99;

    // Save Shard 0
    const saveOk = await persistenceManager.saveGalaxy("public", shard0Game);
    expect(saveOk).toBe(true);

    // Verify key in store
    const storedCampaign = await store.load("faction:campaign:state:public");
    expect(storedCampaign).toBeDefined();
    expect(storedCampaign.ticks).toBe(88);
    expect(storedCampaign.militaryPower.core.Federation).toBe(99);

    // Load onto Shard 1
    const snapshot = await persistenceManager.loadGalaxy("public");
    expect(snapshot).toBeDefined();
    expect(snapshot.factionWarCampaign).toBeDefined();
    expect(snapshot.factionWarCampaign.ticks).toBe(88);
  });

  test("Pub/Sub campaign sync load and broadcast behavior works cleanly", () => {
    const clientsSent = [];
    const mockClient = {
      id: "p1",
      ws: {
        readyState: 1,
        OPEN: 1,
        send(data) {
          clientsSent.push(JSON.parse(data));
        },
      },
    };
    shard1Game.clients.set("ws-p1", mockClient);

    // Define mock pubsub sync payload
    const serializedState = {
      ticks: 42,
      seed: 1337,
      militaryPower: {
        core: { Federation: 55 },
      },
      activeSieges: { core: null },
      blockades: { core: null },
      battleHistory: [],
    };

    // Simulate pubsub delivery to Shard 1
    shard1Game.factionWarCampaign.load(serializedState);
    shard1Game.broadcast({
      type: "faction_campaign_sync",
      campaign: serializedState,
    });

    // Expect campaign state to be updated on Shard 1
    expect(shard1Game.factionWarCampaign.ticks).toBe(42);
    expect(shard1Game.factionWarCampaign.militaryPower.core.Federation).toBe(
      55,
    );

    // Expect connected clients to receive the faction_campaign_sync broadcast
    expect(clientsSent.length).toBe(1);
    expect(clientsSent[0].type).toBe("faction_campaign_sync");
    expect(clientsSent[0].campaign.ticks).toBe(42);
  });
});
