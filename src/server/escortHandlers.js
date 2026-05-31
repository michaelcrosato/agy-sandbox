import { handleEscortCommand } from "./portHandlers.js";

/**
 * Handles "escort_command" and "escort_formation" WebSocket messages.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {object} msg - The incoming action message payload.
 * @param {object} room - The current GameInstance room context.
 */
export function handleEscortAction(clientObj, msg, room) {
  if (!room) return;

  if (msg.type === "escort_command") {
    handleEscortCommand(clientObj, msg, room);
  } else if (msg.type === "escort_formation") {
    let count = 0;
    const formation = msg.formation || "orbit";
    const aisList = room.ais || [];
    for (const ai of aisList) {
      if (ai.role === "escort" && ai.flagship === clientObj.ship) {
        ai.formation = formation;
        count++;
      }
    }
    clientObj.send({
      type: "notification",
      message: `Wingmen ordered into [${formation.toUpperCase()}] formation (${count} ships)`,
      style: "success",
    });
  }
}
