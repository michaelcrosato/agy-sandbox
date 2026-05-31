import { GameInstance } from "../engine/GameInstance.js";
import { applyPlayer } from "../persistence/serializers.js";
import { matchRoom } from "./matchmaking.js";
import { assignShard } from "../net/roomRouter.js";

/**
 * Handles the "join", "quick_join", "create_room", and "join_room" WebSocket messages.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {object} msg - The incoming action message payload.
 * @param {object} ws - The raw WebSocket connection.
 * @param {object} options - Unified singletons and callbacks from server context.
 */
export function handleConnectionAction(clientObj, msg, ws, options) {
  const {
    instances,
    clients,
    persistentSessions,
    persistenceManager,
    galacticChronicle,
    WORKERS,
    SHARD_INDEX,
    matchmakingQueue,
    joinRoom,
    sendLobbyList,
    broadcastLobbySync,
  } = options;

  if (msg.type === "join") {
    const token = msg.sessionToken;

    if (token && !persistentSessions.has(token)) {
      // First-touch after a server restart
      persistenceManager
        .loadPlayer(token)
        .then((wrapped) => {
          if (!wrapped || !wrapped.player) {
            sendLobbyList(clientObj, instances);
            return;
          }
          if (typeof wrapped.player.id === "string" && wrapped.player.id) {
            clientObj.id = wrapped.player.id;
          }
          const targetRoomId =
            wrapped.roomId && instances.has(wrapped.roomId)
              ? wrapped.roomId
              : "public";
          joinRoom(
            clientObj,
            targetRoomId,
            wrapped.player.nickname || clientObj.nickname,
          );
          applyPlayer(clientObj, wrapped.player);
          clientObj.send({
            type: "notification",
            message: `Welcome back, Commander ${clientObj.nickname}. State restored from last session.`,
            style: "success",
          });
          clientObj.sendStats();
        })
        .catch(() => {
          sendLobbyList(clientObj, instances);
        });
      return;
    }

    if (token && persistentSessions.has(token)) {
      const sessionClient = persistentSessions.get(token);

      if (sessionClient.cleanupTimeout) {
        clearTimeout(sessionClient.cleanupTimeout);
        sessionClient.cleanupTimeout = null;
      }

      sessionClient.ws = ws;
      clients.delete(ws);
      clients.set(ws, sessionClient);

      const currentRoom =
        instances.get(sessionClient.roomId) || instances.get("public");
      sessionClient.roomId = currentRoom.id;

      // Clean up any stale WebSocket mapping for this client in the room to prevent double broadcasts
      for (const [oldWs, cl] of currentRoom.clients.entries()) {
        if (cl === sessionClient && oldWs !== ws) {
          currentRoom.clients.delete(oldWs);
        }
      }
      currentRoom.clients.set(ws, sessionClient);
      currentRoom.needsKeyframe = true;

      if (sessionClient.ship) {
        const existing = currentRoom.engine.entities.find(
          (e) => e.id === sessionClient.id,
        );
        if (!existing) {
          currentRoom.engine.addEntity(sessionClient.ship);
        }
      }

      sessionClient.send({
        type: "init",
        playerId: sessionClient.id,
        nickname: sessionClient.nickname,
        sessionToken: token,
        roomId: currentRoom.id,
        roomName: currentRoom.name,
        tutorialCompleted: !!sessionClient.tutorialCompleted,
      });

      sessionClient.send({
        type: "notification",
        message: `Neural link re-established! Welcome back, Commander ${sessionClient.nickname}.`,
        style: "success",
      });

      currentRoom.broadcastNotification(
        `Commander ${sessionClient.nickname} has re-established neural link!`,
        "success",
      );
      sessionClient.sendStats();

      const bulkMarkets = {};
      for (const p of currentRoom.planets) {
        bulkMarkets[p.name] = p.market;
      }
      sessionClient.send({
        type: "market_bulk_sync",
        markets: bulkMarkets,
      });

      sessionClient.send({
        type: "event_sync",
        event: currentRoom.activeSectorEvent
          ? {
              type: currentRoom.activeSectorEvent.type,
              planetName: currentRoom.activeSectorEvent.planetName,
            }
          : null,
      });

      currentRoom.broadcastRosterUpdate();
      if (sessionClient.fleetName) {
        currentRoom.broadcastFleetUpdate(sessionClient.fleetName);
      }
    } else {
      sendLobbyList(clientObj, instances);
    }
  } else if (msg.type === "quick_join") {
    const criteria = {
      mode: msg.mode,
      tags: Array.isArray(msg.tags) ? msg.tags : undefined,
    };
    const roomsMeta = [];
    for (const r of instances.values()) roomsMeta.push(r.metadata());
    const decision = matchRoom(roomsMeta, criteria);

    if (decision.action === "join") {
      joinRoom(clientObj, decision.roomId, msg.nickname);
      broadcastLobbySync(instances, clients);
    } else if (decision.action === "create") {
      let qRoomId;
      let qAttempts = 0;
      do {
        qRoomId = "room-" + Math.random().toString(36).substring(2, 9);
        qAttempts++;
      } while (
        WORKERS > 1 &&
        assignShard(qRoomId, WORKERS) !== SHARD_INDEX &&
        qAttempts < 100
      );
      const created = new GameInstance(
        qRoomId,
        (msg.name || "Quick Match").trim().substring(0, 20) || "Quick Match",
      );
      created.chronicle = galacticChronicle;
      if (typeof msg.mode === "string") created.mode = msg.mode;
      if (Number.isFinite(msg.maxPlayers)) created.maxPlayers = msg.maxPlayers;
      if (Array.isArray(msg.tags)) created.tags = msg.tags;
      instances.set(qRoomId, created);
      joinRoom(clientObj, qRoomId, msg.nickname);
      broadcastLobbySync(instances, clients);
    } else {
      matchmakingQueue.enqueue({
        clientObj,
        criteria,
        nickname: msg.nickname || clientObj.nickname,
      });

      clientObj.send({
        type: "matchmaking_queued",
        message: "All matching sectors are full. You are in the queue.",
        criteria,
      });
    }
  } else if (msg.type === "create_room") {
    const name = (msg.name || "").trim().substring(0, 20);
    if (!name) {
      clientObj.send({
        type: "notification",
        message: "Invalid Sector Name!",
        style: "error",
      });
      return;
    }
    let newRoomId;
    let attempts = 0;
    do {
      newRoomId = "room-" + Math.random().toString(36).substring(2, 9);
      attempts++;
    } while (
      WORKERS > 1 &&
      assignShard(newRoomId, WORKERS) !== SHARD_INDEX &&
      attempts < 100
    );
    const newRoomInstance = new GameInstance(newRoomId, name);
    newRoomInstance.chronicle = galacticChronicle;
    instances.set(newRoomId, newRoomInstance);
    console.log(`🌌 Created custom sector: [${name}] (${newRoomId})`);

    joinRoom(clientObj, newRoomId, msg.nickname);
    broadcastLobbySync(instances, clients);
  } else if (msg.type === "join_room") {
    joinRoom(clientObj, msg.roomId || "public", msg.nickname);
    broadcastLobbySync(instances, clients);
  }
}
