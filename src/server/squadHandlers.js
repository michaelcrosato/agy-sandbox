/**
 * Handles "squad_invite", "squad_join", and "squad_leave" WebSocket messages.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {object} msg - The incoming action message payload.
 * @param {object} wss - The WebSocketServer instance to access other connected clients.
 * @param {object} squadManager - The squad manager instance.
 * @param {object} [pubsub] - The optional PubSub instance for cross-process events.
 */
export function handleSquadAction(
  clientObj,
  msg,
  wss,
  squadManager,
  pubsub = null,
) {
  if (msg.type === "squad_invite") {
    const clientsSet = wss && wss.clients ? wss.clients : new Set();
    const target = Array.from(clientsSet)
      .map((ws) => ws.clientObj)
      .find(
        (c) =>
          c &&
          (c.id === msg.targetId ||
            (msg.targetNickname && c.nickname === msg.targetNickname)),
      );

    let squad = squadManager.getSquadForPlayer(clientObj.id);
    if (!squad) {
      squad = squadManager.createSquad(clientObj.id);
      if (pubsub) {
        pubsub.publish("squad:events", {
          type: "squad_update",
          squadId: squad.id,
          leaderId: squad.leaderId,
          memberIds: Array.from(squad.memberIds),
        });
      }
    }

    if (target) {
      target.send({
        type: "squad_invite_received",
        senderId: clientObj.id,
        senderNickname: clientObj.nickname,
        squadId: squad.id,
      });
      clientObj.send({
        type: "notification",
        message: `Sent squad invite to ${target.nickname}!`,
        style: "success",
      });
    } else if (pubsub) {
      // Scale-out distributed invite broadcast
      pubsub.publish("squad:events", {
        type: "squad_invite",
        senderId: clientObj.id,
        senderNickname: clientObj.nickname,
        targetId: msg.targetId,
        targetNickname: msg.targetNickname,
        squadId: squad.id,
      });
      clientObj.send({
        type: "notification",
        message: `Sent squad invite to ${msg.targetNickname || "player"}!`,
        style: "success",
      });
    } else {
      clientObj.send({
        type: "notification",
        message: "Target player not found!",
        style: "error",
      });
    }
  } else if (msg.type === "squad_join") {
    const res = squadManager.joinSquad(msg.squadId, clientObj.id);
    if (res.success) {
      const squad = squadManager.getSquadForPlayer(clientObj.id);
      if (pubsub && squad) {
        pubsub.publish("squad:events", {
          type: "squad_update",
          squadId: squad.id,
          leaderId: squad.leaderId,
          memberIds: Array.from(squad.memberIds),
        });
      }

      const clientsSet = wss && wss.clients ? wss.clients : new Set();
      const squadMembers = Array.from(clientsSet)
        .map((ws) => ws.clientObj)
        .filter((c) => c && squad.memberIds.has(c.id));
      for (const member of squadMembers) {
        member.send({
          type: "notification",
          message: `${clientObj.nickname} joined the squad!`,
          style: "success",
        });
        member.sendStats();
      }
    } else {
      clientObj.send({
        type: "notification",
        message: res.reason,
        style: "error",
      });
    }
  } else if (msg.type === "squad_leave") {
    const squad = squadManager.getSquadForPlayer(clientObj.id);
    if (squad) {
      const squadId = squad.id;
      squadManager.leaveSquad(clientObj.id);
      clientObj.send({
        type: "notification",
        message: "You left the squad.",
        style: "info",
      });
      clientObj.sendStats();

      const updatedSquad = squadManager.squads
        ? squadManager.squads.get(squadId)
        : null;
      if (pubsub) {
        if (updatedSquad) {
          pubsub.publish("squad:events", {
            type: "squad_update",
            squadId: squadId,
            leaderId: updatedSquad.leaderId,
            memberIds: Array.from(updatedSquad.memberIds),
          });
        } else {
          // Squad dissolved
          pubsub.publish("squad:events", {
            type: "squad_update",
            squadId: squadId,
            leaderId: null,
            memberIds: [],
          });
        }
      }

      const clientsSet = wss && wss.clients ? wss.clients : new Set();
      const remainingMembers = Array.from(clientsSet)
        .map((ws) => ws.clientObj)
        .filter((c) => c && squadManager.getSquadId(c.id) === squadId);
      for (const member of remainingMembers) {
        member.send({
          type: "notification",
          message: `${clientObj.nickname} left the squad.`,
          style: "info",
        });
        member.sendStats();
      }
    }
  }
}
