/**
 * Handles "squad_invite", "squad_join", and "squad_leave" WebSocket messages.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {object} msg - The incoming action message payload.
 * @param {object} wss - The WebSocketServer instance to access other connected clients.
 * @param {object} squadManager - The squad manager instance.
 */
export function handleSquadAction(clientObj, msg, wss, squadManager) {
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
    if (!target) {
      clientObj.send({
        type: "notification",
        message: "Target player not found!",
        style: "error",
      });
      return;
    }
    let squad = squadManager.getSquadForPlayer(clientObj.id);
    if (!squad) {
      squad = squadManager.createSquad(clientObj.id);
    }
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
  } else if (msg.type === "squad_join") {
    const res = squadManager.joinSquad(msg.squadId, clientObj.id);
    if (res.success) {
      const squad = squadManager.getSquadForPlayer(clientObj.id);
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
