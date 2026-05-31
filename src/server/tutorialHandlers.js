/**
 * Handles the "tutorial_complete" WebSocket message.
 * Marks the tutorial as completed, awards credits, and immediately persists state.
 *
 * @param {object} clientObj - The active client connection object.
 * @param {Map} instances - The Map of active room instances.
 * @param {object} persistenceManager - The PersistenceManager instance.
 */
export function handleTutorialComplete(
  clientObj,
  instances,
  persistenceManager,
) {
  if (!clientObj.tutorialCompleted) {
    clientObj.tutorialCompleted = true;
    if (clientObj.ship) {
      clientObj.ship.credits = (clientObj.ship.credits || 0) + 500;
    }
    clientObj.send({
      type: "notification",
      message: "ONBOARDING COMPLETE: +500 CR awarded!",
      style: "success",
    });
    clientObj.sendStats();

    // Immediately persist the completion state to disk
    if (instances && persistenceManager) {
      const activeRoom = clientObj.roomId
        ? instances.get(clientObj.roomId)
        : null;
      if (activeRoom) {
        persistenceManager.savePlayer(clientObj.id, clientObj, activeRoom.id);
      }
    }
  }
}
