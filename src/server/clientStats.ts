/**
 * Sends player and squad statistics updates to a client.
 * Saves active ship state in the persistent presence registry.
 *
 * @param {object} clientObj - The target client connection object.
 * @param {object} options - Unified context containing stores, singletons, and helper callbacks.
 */
export async function sendClientStats(clientObj, options) {
  const {
    storeInstance,
    instances,
    squadManager,
    getClients,
    buildStatsPayload,
  } = options;

  // Save local player stats to the shared presence store so other shards can read them
  if (clientObj.ship) {
    try {
      const presencePayload = {
        id: clientObj.id,
        nickname: clientObj.nickname,
        roomId: clientObj.roomId,
        ship: {
          shield: clientObj.ship.shield,
          maxShield: clientObj.ship.maxShield,
          armor: clientObj.ship.armor,
          maxArmor: clientObj.ship.maxArmor,
          targetName: clientObj.ship.target ? clientObj.ship.target.name : null,
          position: {
            x: clientObj.ship.position.x,
            y: clientObj.ship.position.y,
          },
        },
      };
      await storeInstance.save(
        `presence:player:${clientObj.id}`,
        presencePayload,
      );
    } catch (_err) {
      // swallow store write failures safely
    }
  }

  const room = instances.get(clientObj.roomId);
  const registry = room ? room.factionRegistry : null;

  const squadMembers = [];
  const squad = squadManager.getSquadForPlayer(clientObj.id);
  if (squad) {
    for (const memberId of squad.memberIds) {
      if (memberId === clientObj.id) continue;

      let smClient = getClients().find((c) => c && c.id === memberId);

      if (!smClient) {
        try {
          const remotePresence = await storeInstance.load(
            `presence:player:${memberId}`,
          );
          if (remotePresence) {
            smClient = {
              id: remotePresence.id,
              nickname: remotePresence.nickname,
              ship: {
                shield: remotePresence.ship.shield,
                maxShield: remotePresence.ship.maxShield,
                armor: remotePresence.ship.armor,
                maxArmor: remotePresence.ship.maxArmor,
                target: remotePresence.ship.targetName
                  ? { name: remotePresence.ship.targetName }
                  : null,
                position: remotePresence.ship.position,
              },
            };
          }
        } catch (_err) {
          // safe fallback
        }
      }

      if (smClient) {
        squadMembers.push(smClient);
      }
    }
  }

  const payload = buildStatsPayload(clientObj, registry, squadMembers);
  if (payload) clientObj.send(payload);
}
