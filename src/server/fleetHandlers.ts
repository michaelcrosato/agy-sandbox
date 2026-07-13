/**
 * Handles "fleet_create", "fleet_join", and "fleet_leave" WebSocket messages.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {object} msg - The incoming action message payload.
 * @param {object} room - The current GameInstance room context.
 */
export function handleFleetAction(clientObj, msg, room) {
  if (!room) return;

  if (msg.type === "fleet_create" || msg.type === "fleet_join") {
    const code = (msg.fleetName || "").toUpperCase().trim().substring(0, 10);
    if (!code) {
      clientObj.send({
        type: "notification",
        message: "Invalid Fleet Code!",
        style: "error",
      });
      return;
    }

    room.leaveCurrentFleet(clientObj);
    clientObj.fleetName = code;
    if (!room.fleets.has(code)) {
      room.fleets.set(code, new Set());
    }
    room.fleets.get(code).add(clientObj);

    clientObj.send({
      type: "notification",
      message: `Joined fleet: ${code}`,
      style: "success",
    });

    if (typeof room.broadcastFleetUpdate === "function") {
      room.broadcastFleetUpdate(code);
    }
    room.broadcastRosterUpdate();
  } else if (msg.type === "fleet_leave") {
    if (clientObj.fleetName) {
      const oldCode = clientObj.fleetName;
      room.leaveCurrentFleet(clientObj);
      clientObj.send({
        type: "notification",
        message: `Left fleet: ${oldCode}`,
        style: "info",
      });
      room.broadcastRosterUpdate();
    }
  }
}
