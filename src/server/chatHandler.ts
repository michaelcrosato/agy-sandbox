/**
 * Handles the "chat" WebSocket message.
 * Supports global, squad, and fleet chat channels.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {object} msg - The incoming chat message payload.
 * @param {object} room - The current GameInstance room context.
 * @param {object} pubsub - The PubSub instance for cross-process/cross-server events.
 * @param {object} squadManager - The squad manager instance.
 */
export async function handleChat(clientObj, msg, room, pubsub, squadManager) {
  const channel = msg.channel || "global";
  const text = (msg.text || "").trim().substring(0, 100);
  if (!text) return;

  let isSquadMsg = channel === "squad";
  let squadText = text;
  if (text.startsWith("/squad ")) {
    isSquadMsg = true;
    squadText = text.substring(7).trim();
  }

  if (isSquadMsg) {
    const squad = squadManager.getSquadForPlayer(clientObj.id);
    if (!squad) {
      clientObj.send({
        type: "notification",
        message:
          "You are not in a squad! Invite someone using /squad invite or join a squad.",
        style: "error",
      });
      return;
    }

    const chatPayload = {
      type: "chat",
      channel: "squad",
      sender: clientObj.nickname,
      text: squadText,
      squadId: squad.id,
    };

    await pubsub.publish("chat:squad", chatPayload);
  } else if (channel === "fleet" && room) {
    if (!clientObj.fleetName) {
      clientObj.send({
        type: "notification",
        message: "You are not in a fleet! Join a fleet to use Fleet comms.",
        style: "error",
      });
      return;
    }

    const fleetSet = room.fleets.get(clientObj.fleetName);
    if (fleetSet) {
      const chatPayload = {
        type: "chat",
        channel: "fleet",
        sender: clientObj.nickname,
        text: text,
      };
      for (const member of fleetSet) {
        member.send(chatPayload);
      }
    }
  } else if (room) {
    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: clientObj.nickname,
      text: text,
    };
    await pubsub.publish("chat:global", chatPayload);
  }
}
