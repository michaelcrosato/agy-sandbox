import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";
import { GameInstance } from "../engine/GameInstance.js";
import { applyGalaxy } from "../persistence/serializers.js";
import { sanitizeNickname } from "./roomLifecycle.js";

/**
 * Handles room joining lifecycle logic including switching cleanup, dynamic instantiations,
 * ship spawning, and initialization syncing.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {string} roomId - Target room identifier.
 * @param {string} nickname - Client nickname candidate.
 * @param {object} options - Unified singletons and helper callbacks context.
 */
export async function joinRoom(clientObj, roomId, nickname, options) {
  const {
    instances,
    WORKERS,
    SHARD_INDEX,
    loadRegistry,
    routeConnection,
    galacticChronicle,
    persistenceManager,
    saveRegistry,
    persistentSessions,
    processMatchmakingQueueForRoom,
  } = options;

  // 1. Clean up from previous room if switching
  if (clientObj.roomId) {
    const prevRoom = instances.get(clientObj.roomId);
    if (prevRoom && prevRoom.id !== roomId) {
      console.log(
        `🧼 Cleaning up client [${clientObj.nickname}] (${clientObj.id}) from previous sector: [${prevRoom.name}]`,
      );

      // Leave fleet
      prevRoom.leaveCurrentFleet(clientObj);

      // Clean up escorts
      if (clientObj.ship) {
        const escortsToRemove = [];
        for (const ai of prevRoom.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            escortsToRemove.push(ai);
          }
        }
        for (const ai of escortsToRemove) {
          prevRoom.engine.removeEntity(ai.ship.id);
          const idx = prevRoom.ais.indexOf(ai);
          if (idx !== -1) {
            prevRoom.ais.splice(idx, 1);
          }
        }

        // Remove ship from previous room engine
        prevRoom.engine.removeEntity(clientObj.ship.id);
      }

      // Remove client mapping
      prevRoom.clients.delete(clientObj.ws);

      prevRoom.broadcastNotification(
        `${clientObj.nickname} has left the sector.`,
        "info",
      );
      prevRoom.broadcastRosterUpdate();

      // Freed slot inside prevRoom -> scan the matchmaking queue!
      processMatchmakingQueueForRoom(prevRoom);
    }
  }

  let room = instances.get(roomId);
  if (!room && WORKERS > 1 && roomId) {
    const registry = await loadRegistry();
    const ownerNodeId = routeConnection({
      roomId,
      registry,
      shardCount: WORKERS,
    });
    if (ownerNodeId === `node-${SHARD_INDEX}`) {
      room = new GameInstance(roomId, `Sector ${roomId}`);
      room.chronicle = galacticChronicle;
      instances.set(roomId, room);
      console.log(
        `🌌 Dynamically instantiated custom sector on owning shard: [${room.name}] (${roomId})`,
      );

      // Restore any saved dynamic room galaxy state from store
      try {
        const snapshot = await persistenceManager.loadGalaxy(roomId);
        if (snapshot) {
          applyGalaxy(room, snapshot);
          console.log(
            `💾 Restored galaxy state for dynamic sector [${room.name}]`,
          );
        }
      } catch (err) {
        console.error(
          `⚠️ Failed to restore dynamic room galaxy: ${err.message}`,
        );
      }

      // Claim immediately inside the shared RoomRegistry presence
      registry.claim(roomId, `node-${SHARD_INDEX}`, Date.now() + 10000);
      await saveRegistry(registry);
    } else {
      clientObj.send({
        type: "notification",
        message: `Sector [${roomId}] is hosted on a different shard!`,
        style: "error",
      });
      return;
    }
  }

  if (!room) {
    room = instances.get("public");
  }

  if (!room) {
    clientObj.send({
      type: "notification",
      message: `Sector [${roomId}] is hosted on a different shard!`,
      style: "error",
    });
    return;
  }

  clientObj.roomId = room.id;
  clientObj.nickname = sanitizeNickname(nickname);

  room.clients.set(clientObj.ws, clientObj);
  room.lastActiveTime = Date.now();
  // Force the next broadcast to be a keyframe so the newcomer starts from a
  // full snapshot instead of waiting up to ~1s for the next scheduled one.
  room.needsKeyframe = true;
  // Per-client broadcast baseline (spec 014): the newcomer's snapshot/delta
  // stream is framed independently each tick against its own AOI; start it from
  // a fresh keyframe.
  clientObj.broadcastState = null;
  clientObj.needsKeyframe = true;

  const spawnPos = new Vector2D(
    (Math.random() - 0.5) * 150,
    -150 + (Math.random() - 0.5) * 50,
  );
  const ship = new Ship({
    id: clientObj.id,
    name: clientObj.nickname,
    position: spawnPos,
    velocity: new Vector2D(0, 0),
    heading: -Math.PI / 2,
    maxShield: 200,
    maxArmor: 100,
    credits: 5000,
    cargoCapacity: 20,
    thrustPower: 90000,
    brakePower: 50000,
    maxSpeed: 1800,
    turnRate: 3.2,
  });

  clientObj.ship = ship;
  room.engine.addEntity(ship);

  // Set up global session token
  const sessionToken = clientObj.id;
  persistentSessions.set(sessionToken, clientObj);

  clientObj.send({
    type: "init",
    playerId: clientObj.id,
    nickname: clientObj.nickname,
    sessionToken: sessionToken,
    roomId: room.id,
    roomName: room.name,
    tutorialCompleted: !!clientObj.tutorialCompleted,
  });

  clientObj.send({
    type: "notification",
    message: `Welcome aboard Commander ${clientObj.nickname}! Sector ${room.name.toUpperCase()} systems nominal.`,
    style: "success",
  });

  room.broadcastNotification(`${clientObj.nickname} entered sector!`, "info");
  clientObj.sendStats();

  const bulkMarkets = {};
  for (const p of room.planets) {
    bulkMarkets[p.name] = p.market;
  }
  clientObj.send({
    type: "market_bulk_sync",
    markets: bulkMarkets,
  });

  clientObj.send({
    type: "event_sync",
    event: room.activeSectorEvent
      ? {
          type: room.activeSectorEvent.type,
          planetName: room.activeSectorEvent.planetName,
        }
      : null,
  });

  if (room.territoryControl) {
    clientObj.send({
      type: "territory_sync",
      sectors: room.territoryControl.sectors,
    });
  }

  if (room.galaxyEventsManager && room.galaxyEventsManager.activeEvent) {
    clientObj.send({
      type: "galaxy_event_announcement",
      event: room.galaxyEventsManager.activeEvent,
    });
  }

  room.broadcastRosterUpdate();
}

/**
 * Handles raw WebSocket disconnect close events by deregistering IPs, removing matchmaking queue
 * entries, and scheduling delayed sector evictions and data saving.
 *
 * @param {object} ws - The raw WebSocket instance.
 * @param {object} clientObj - Fallback client object.
 * @param {object} options - Unified singletons and helper callbacks context.
 */
export function handleClientDisconnect(ws, clientObj, options) {
  const {
    clients,
    connectionFloodSentry,
    matchmakingQueue,
    instances,
    persistenceManager,
    persistentSessions,
    processMatchmakingQueueForRoom,
    broadcastLobbySync,
  } = options;

  const activeClient = clients.get(ws) || clientObj;
  if (activeClient && activeClient.ip) {
    connectionFloodSentry.deregister(activeClient.ip);
  }

  // Prune this client from the matchmaking queue immediately on disconnect
  matchmakingQueue.remove(activeClient);
  matchmakingQueue.waiting = matchmakingQueue.waiting.filter(
    (c) => c.clientObj !== activeClient && c.clientObj.ws !== ws,
  );

  activeClient.cleanupTimeout = setTimeout(() => {
    const currentRoom = instances.get(activeClient.roomId);
    // Persist the player's final state before evicting session from
    // memory; this is the only chance to capture credits/cargo/missions for
    // a returning pilot who reconnects after the server restarts.
    persistenceManager.savePlayer(
      activeClient.id,
      activeClient,
      activeClient.roomId,
    );
    if (currentRoom) {
      currentRoom.leaveCurrentFleet(activeClient);
      if (activeClient.ship) {
        // Also clean up any escorts belonging to this client!
        const escortsToRemove = [];
        for (const ai of currentRoom.ais) {
          if (ai.role === "escort" && ai.flagship === activeClient.ship) {
            escortsToRemove.push(ai);
          }
        }
        for (const ai of escortsToRemove) {
          currentRoom.engine.removeEntity(ai.ship.id);
          const idx = currentRoom.ais.indexOf(ai);
          if (idx !== -1) {
            currentRoom.ais.splice(idx, 1);
          }
        }

        currentRoom.engine.removeEntity(activeClient.id);
      }
      currentRoom.clients.delete(ws);
    }
    clients.delete(ws);
    persistentSessions.delete(activeClient.id);
    if (currentRoom) {
      currentRoom.broadcastNotification(
        `${activeClient.nickname} has left the sector (neural link lost).`,
        "info",
      );
      currentRoom.broadcastRosterUpdate();

      // Freed slot inside currentRoom -> scan the matchmaking queue!
      processMatchmakingQueueForRoom(currentRoom);
    }
    broadcastLobbySync(instances, clients);
  }, 30000);

  clients.delete(ws);
  const currentRoom = instances.get(activeClient.roomId);
  if (currentRoom) {
    currentRoom.broadcastNotification(
      `${activeClient.nickname} neural link disconnected. Standby recovery active...`,
      "warning",
    );
    currentRoom.broadcastRosterUpdate();
  }
}
