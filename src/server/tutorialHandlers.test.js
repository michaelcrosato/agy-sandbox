import { jest } from "@jest/globals";
import { handleTutorialComplete } from "./tutorialHandlers.js";

describe("tutorialHandlers", () => {
  let clientObj;
  let instances;
  let persistenceManager;
  let room;

  beforeEach(() => {
    clientObj = {
      id: "p1",
      roomId: "room-1",
      tutorialCompleted: false,
      ship: { credits: 100 },
      send: jest.fn(),
      sendStats: jest.fn(),
    };
    room = { id: "room-1" };
    instances = new Map([["room-1", room]]);
    persistenceManager = {
      savePlayer: jest.fn(),
    };
  });

  test("completes tutorial, awards credits, sends stats, and persists state", () => {
    handleTutorialComplete(clientObj, instances, persistenceManager);

    expect(clientObj.tutorialCompleted).toBe(true);
    expect(clientObj.ship.credits).toBe(600); // 100 + 500
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "notification",
      message: "ONBOARDING COMPLETE: +500 CR awarded!",
      style: "success",
    });
    expect(clientObj.sendStats).toHaveBeenCalled();
    expect(persistenceManager.savePlayer).toHaveBeenCalledWith(
      "p1",
      clientObj,
      "room-1",
    );
  });

  test("does nothing if tutorial is already completed", () => {
    clientObj.tutorialCompleted = true;
    clientObj.ship.credits = 1000;

    handleTutorialComplete(clientObj, instances, persistenceManager);

    expect(clientObj.ship.credits).toBe(1000); // unchanged
    expect(clientObj.send).not.toHaveBeenCalled();
    expect(persistenceManager.savePlayer).not.toHaveBeenCalled();
  });

  test("works when ship is missing", () => {
    clientObj.ship = null;
    handleTutorialComplete(clientObj, instances, persistenceManager);

    expect(clientObj.tutorialCompleted).toBe(true);
    expect(clientObj.send).toHaveBeenCalled();
    expect(persistenceManager.savePlayer).toHaveBeenCalled();
  });
});
