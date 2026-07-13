import { freeSlots, roomMatches } from "./matchmaking.js";

/**
 * Sweeps the matchmaking queue for players waiting to join the specified room.
 *
 * @param {Object} room - The room instance to admit players to.
 * @param {Object} options - Options context dependencies.
 * @param {Object} options.matchmakingQueue - The JoinQueue instance.
 * @param {Function} options.joinRoom - The function to join a room.
 * @param {Function} options.broadcastLobbySync - The function to broadcast lobby sync.
 * @param {Map} options.instances - Map of active room instances.
 * @param {Map} options.clients - Map of connected clients.
 */
export function processMatchmakingQueueForRoom(room, options) {
  const { matchmakingQueue, joinRoom, broadcastLobbySync, instances, clients } =
    options;

  const free = freeSlots(room.metadata());
  if (free <= 0) return;

  const admitted = [];
  // Scan the queue for any matching candidates
  for (let i = 0; i < matchmakingQueue.waiting.length; i++) {
    const candidate = matchmakingQueue.waiting[i];

    // Prune dead/disconnected client sockets from the queue
    if (
      !candidate.clientObj.ws ||
      candidate.clientObj.ws.readyState !== 1 /* OPEN */
    ) {
      matchmakingQueue.waiting.splice(i, 1);
      i--;
      continue;
    }

    if (roomMatches(room.metadata(), candidate.criteria)) {
      admitted.push(candidate);
      matchmakingQueue.waiting.splice(i, 1);
      i--;
      if (admitted.length >= free) break;
    }
  }

  // Admit candidates
  for (const candidate of admitted) {
    console.log(
      `📡 Queue: Admitting queued player ${candidate.nickname} to sector ${room.name} (${room.id})`,
    );
    joinRoom(candidate.clientObj, room.id, candidate.nickname);
    candidate.clientObj.send({
      type: "match_admitted",
      roomId: room.id,
    });
  }

  if (admitted.length > 0) {
    broadcastLobbySync(instances, clients);
  }
}
