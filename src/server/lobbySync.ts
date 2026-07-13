/**
 * Compiles metadata for all active room instances.
 *
 * @param {Map} instances - Active room instances.
 * @returns {Array<Object>} List of room metadata payloads.
 */
export function buildLobbyRoomsList(instances) {
  const roomsList = [];
  for (const room of instances.values()) {
    const meta = room.metadata();
    roomsList.push({
      id: meta.id,
      name: meta.name,
      playersCount: meta.players,
      mode: meta.mode,
      maxPlayers: meta.maxPlayers,
      tags: meta.tags,
    });
  }
  return roomsList;
}

/**
 * Broadcasts the complete lobby registry update to all idle lobby clients.
 *
 * @param {Map} instances - Active room instances.
 * @param {Map} clients - All server-connected clients.
 */
export function broadcastLobbySync(instances, clients) {
  const roomsList = buildLobbyRoomsList(instances);
  const payload = {
    type: "lobby_sync",
    rooms: roomsList,
  };

  const str = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (!client.roomId) {
      if (client.ws && client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(str);
      }
    }
  }
}

/**
 * Dispatches the current lobby registration list to a single connected client.
 *
 * @param {Object} clientObj - Destination client connection wrapper.
 * @param {Map} instances - Active room instances.
 */
export function sendLobbyList(clientObj, instances) {
  const roomsList = buildLobbyRoomsList(instances);
  clientObj.send({
    type: "lobby_sync",
    rooms: roomsList,
  });
}
