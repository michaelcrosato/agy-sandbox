import { describe, test, expect, beforeEach, vi } from "vitest";
import { routeMessage } from "./messageRouter.js";

describe("messageRouter", () => {
  let clientObj;
  let ws;
  let options;
  let room;
  let handlers;

  beforeEach(() => {
    clientObj = {
      id: "player-1",
      roomId: "room-1",
      tutorialStep: null,
      send: vi.fn(),
    };

    ws = {};

    room = { id: "room-1", name: "Alpha Sector" };

    handlers = {
      handleConnectionAction: vi.fn(),
      handleControls: vi.fn(),
      handleLand: vi.fn(),
      handleLaunch: vi.fn(),
      handleTrade: vi.fn(),
      handlePortService: vi.fn(),
      handleOreRefine: vi.fn(),
      handleJettison: vi.fn(),
      handleOutfitBuy: vi.fn(),
      handleOutfitSell: vi.fn(),
      handlePresetSave: vi.fn(),
      handlePresetLoad: vi.fn(),
      handlePresetDelete: vi.fn(),
      handleShipBuy: vi.fn(),
      handleSquadAction: vi.fn(),
      handleVoucherRedeem: vi.fn(),
      handleMissionAccept: vi.fn(),
      handleMissionAbandon: vi.fn(),
      handleFleetAction: vi.fn(),
      handleChat: vi.fn(),
      handleWarpJump: vi.fn(),
      handleBoardingAction: vi.fn(),
      handleEscortAction: vi.fn(),
      handleDistressBeacon: vi.fn(),
      handleTutorialStart: vi.fn(),
      handleTutorialProgress: vi.fn(),
      handleTutorialComplete: vi.fn(),
    };

    options = {
      instances: new Map([["room-1", room]]),
      clients: new Map(),
      persistentSessions: new Map(),
      persistenceManager: {},
      galacticChronicle: {},
      squadManager: {},
      pubsub: {},
      wss: {},
      WORKERS: 1,
      SHARD_INDEX: 0,
      matchmakingQueue: {},
      joinRoom: vi.fn(),
      sendLobbyList: vi.fn(),
      broadcastLobbySync: vi.fn(),
      handlers,
    };
  });

  test("routes connection actions", async () => {
    const msg = { type: "join" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleConnectionAction).toHaveBeenCalledWith(
      clientObj,
      msg,
      ws,
      expect.any(Object),
    );
  });

  test("routes controls message", async () => {
    const msg = { type: "controls" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleControls).toHaveBeenCalledWith(clientObj, msg);
  });

  test("routes land message (non-tutorial)", async () => {
    const msg = { type: "land" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleLand).toHaveBeenCalledWith(
      clientObj,
      room,
      options.persistenceManager,
    );
  });

  test("routes land message in tutorial", async () => {
    clientObj.tutorialStep = "dock_at_port";
    const msg = { type: "land" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleTutorialComplete).toHaveBeenCalledWith(
      clientObj,
      options.instances,
      options.persistenceManager,
      options.joinRoom,
    );
  });

  test("routes launch message", async () => {
    const msg = { type: "launch" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleLaunch).toHaveBeenCalledWith(clientObj, room);
  });

  test("routes trade message", async () => {
    const msg = { type: "trade" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleTrade).toHaveBeenCalledWith(clientObj, msg, room);
  });

  test("routes port_service message", async () => {
    const msg = { type: "port_service" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handlePortService).toHaveBeenCalledWith(clientObj, msg);
  });

  test("routes port_refine message", async () => {
    const msg = {
      type: "port_refine",
      quantity: 5,
      targetCommodity: "minerals",
    };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleOreRefine).toHaveBeenCalledWith(
      clientObj,
      5,
      "minerals",
      room,
    );
  });

  test("routes jettison message", async () => {
    const msg = { type: "jettison" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleJettison).toHaveBeenCalledWith(clientObj, msg, room);
  });

  test("routes outfit_buy message", async () => {
    clientObj.planetLandedOn = "Planet-A";
    const msg = { type: "outfit_buy", outfitName: "Laser" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleOutfitBuy).toHaveBeenCalledWith(
      clientObj,
      "Laser",
      "Planet-A",
      room,
    );
  });

  test("routes outfit_sell message", async () => {
    clientObj.planetLandedOn = "Planet-A";
    const msg = { type: "outfit_sell", outfitName: "Laser" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleOutfitSell).toHaveBeenCalledWith(
      clientObj,
      "Laser",
      "Planet-A",
      room,
    );
  });

  test("routes preset_save message", async () => {
    const msg = {
      type: "preset_save",
      presetIndex: 0,
      presetName: "My Loadout",
    };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handlePresetSave).toHaveBeenCalledWith(
      clientObj,
      0,
      "My Loadout",
    );
  });

  test("routes preset_load message", async () => {
    clientObj.planetLandedOn = "Planet-A";
    const msg = { type: "preset_load", presetIndex: 0 };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handlePresetLoad).toHaveBeenCalledWith(
      clientObj,
      0,
      "Planet-A",
      room,
    );
  });

  test("routes preset_delete message", async () => {
    const msg = { type: "preset_delete", presetIndex: 0 };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handlePresetDelete).toHaveBeenCalledWith(clientObj, 0);
  });

  test("routes ship_buy message", async () => {
    clientObj.planetLandedOn = "Planet-A";
    const msg = { type: "ship_buy", shipName: "Fighter" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleShipBuy).toHaveBeenCalledWith(
      clientObj,
      "Fighter",
      "Planet-A",
      room,
    );
  });

  test("routes squad actions", async () => {
    const msg = { type: "squad_invite" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleSquadAction).toHaveBeenCalledWith(
      clientObj,
      msg,
      options.wss,
      options.squadManager,
      options.pubsub,
    );
  });

  test("routes port_redeem_vouchers message", async () => {
    const msg = { type: "port_redeem_vouchers" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleVoucherRedeem).toHaveBeenCalledWith(clientObj, room);
  });

  test("routes mission_accept message", async () => {
    clientObj.planetLandedOn = "Planet-A";
    const msg = {
      type: "mission_accept",
      planetName: "Planet-B",
      missionId: "m1",
    };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleMissionAccept).toHaveBeenCalledWith(
      clientObj,
      "Planet-B",
      "m1",
      "Planet-A",
      room,
    );
  });

  test("routes mission_abandon message", async () => {
    const msg = { type: "mission_abandon", missionId: "m1" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleMissionAbandon).toHaveBeenCalledWith(clientObj, "m1");
  });

  test("routes fleet actions", async () => {
    const msg = { type: "fleet_create" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleFleetAction).toHaveBeenCalledWith(
      clientObj,
      msg,
      room,
    );
  });

  test("routes chat message", async () => {
    const msg = { type: "chat" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleChat).toHaveBeenCalledWith(
      clientObj,
      msg,
      room,
      options.pubsub,
      options.squadManager,
    );
  });

  test("routes warp_jump message", async () => {
    const msg = { type: "warp_jump" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleWarpJump).toHaveBeenCalledWith(clientObj, msg, room);
  });

  test("routes boarding_action message", async () => {
    const msg = { type: "boarding_action" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleBoardingAction).toHaveBeenCalledWith(
      clientObj,
      msg,
      room,
    );
  });

  test("routes escort commands", async () => {
    const msg = { type: "escort_command" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleEscortAction).toHaveBeenCalledWith(
      clientObj,
      msg,
      room,
    );
  });

  test("routes distress_beacon message", async () => {
    const msg = { type: "distress_beacon" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleDistressBeacon).toHaveBeenCalledWith(clientObj, room);
  });

  test("routes tutorial_start message", async () => {
    const msg = { type: "tutorial_start" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleTutorialStart).toHaveBeenCalledWith(
      clientObj,
      options.instances,
      options.joinRoom,
    );
  });

  test("routes tutorial_progress message", async () => {
    const msg = { type: "tutorial_progress" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleTutorialProgress).toHaveBeenCalledWith(
      clientObj,
      msg,
    );
  });

  test("routes tutorial_complete message", async () => {
    const msg = { type: "tutorial_complete" };
    await routeMessage(clientObj, msg, ws, options);
    expect(handlers.handleTutorialComplete).toHaveBeenCalledWith(
      clientObj,
      options.instances,
      options.persistenceManager,
    );
  });

  test("routes ping message", async () => {
    const msg = { type: "ping", time: 12345 };
    await routeMessage(clientObj, msg, ws, options);
    expect(clientObj.send).toHaveBeenCalledWith({
      type: "pong",
      time: 12345,
    });
  });
});
