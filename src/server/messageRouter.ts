import {
  handleOutfitBuy,
  handleShipBuy,
  handleVoucherRedeem,
  handleOutfitSell,
  handleOreRefine,
  handleDistressBeacon,
} from "./portHandlers.js";
import {
  handlePresetSave,
  handlePresetLoad,
  handlePresetDelete,
} from "./outfittingPresetHandlers.js";
import {
  handleMissionAccept,
  handleMissionAbandon,
} from "./spaceportMissionHandlers.js";
import {
  handleTrade,
  handlePortService,
  handleJettison,
  handleWarpJump,
  handleBoardingAction,
} from "./actionHandlers.js";
import { handleChat } from "./chatHandler.js";
import { handleFleetAction } from "./fleetHandlers.js";
import {
  handleControls,
  handleLand,
  handleLaunch,
} from "./gameplayHandlers.js";
import { handleSquadAction } from "./squadHandlers.js";
import { handleEscortAction } from "./escortHandlers.js";
import {
  handleTutorialStart,
  handleTutorialProgress,
  handleTutorialComplete,
} from "./tutorialHandlers.js";
import { handleConnectionAction } from "./connectionHandlers.js";

/**
 * Routes and dispatches incoming WebSocket message payloads to their corresponding modular handlers.
 *
 * @param {object} clientObj - The target client state object.
 * @param {object} msg - The sanitized, preprocessed message payload.
 * @param {object} ws - The raw WebSocket connection.
 * @param {object} options - Unified context singletons and configuration dependencies.
 * @param {Map} options.instances - The active world instances Map.
 * @param {Map} options.clients - The active clients Map.
 * @param {Map} options.persistentSessions - The persistent session tokens Map.
 * @param {object} options.persistenceManager - The persistence manager instance.
 * @param {object} options.galacticChronicle - The galactic chronicle ledger.
 * @param {object} options.squadManager - The squad manager instance.
 * @param {object} options.pubsub - The pub/sub messenger instance.
 * @param {object} options.wss - The WebSocket server instance.
 * @param {number} options.WORKERS - Sharded cluster worker count.
 * @param {number} options.SHARD_INDEX - Sharded cluster worker index.
 * @param {object} options.matchmakingQueue - The matchmaking JoinQueue.
 * @param {function} options.joinRoom - Function to join a room.
 * @param {function} options.sendLobbyList - Function to broadcast the active lobby list.
 * @param {function} options.broadcastLobbySync - Function to synchronize active lobby lists.
 * @param {object} [options.handlers] - Custom action/routing message handlers mapping override.
 * @returns {Promise<void>}
 */
export async function routeMessage(clientObj, msg, ws, options) {
  const {
    instances,
    clients,
    persistentSessions,
    persistenceManager,
    galacticChronicle,
    squadManager,
    pubsub,
    wss,
    WORKERS,
    SHARD_INDEX,
    matchmakingQueue,
    joinRoom,
    sendLobbyList,
    broadcastLobbySync,
    handlers = {
      handleConnectionAction,
      handleControls,
      handleLand,
      handleLaunch,
      handleTrade,
      handlePortService,
      handleOreRefine,
      handleJettison,
      handleOutfitBuy,
      handleOutfitSell,
      handlePresetSave,
      handlePresetLoad,
      handlePresetDelete,
      handleShipBuy,
      handleSquadAction,
      handleVoucherRedeem,
      handleMissionAccept,
      handleMissionAbandon,
      handleFleetAction,
      handleChat,
      handleWarpJump,
      handleBoardingAction,
      handleEscortAction,
      handleDistressBeacon,
      handleTutorialStart,
      handleTutorialProgress,
      handleTutorialComplete,
    },
  } = options;

  const room = clientObj.roomId ? instances.get(clientObj.roomId) : null;

  if (
    msg.type === "join" ||
    msg.type === "quick_join" ||
    msg.type === "create_room" ||
    msg.type === "join_room"
  ) {
    handlers.handleConnectionAction(clientObj, msg, ws, {
      instances,
      clients,
      persistentSessions,
      persistenceManager,
      galacticChronicle,
      WORKERS,
      SHARD_INDEX,
      matchmakingQueue,
      joinRoom,
      sendLobbyList,
      broadcastLobbySync,
    });
  } else if (msg.type === "controls") {
    handlers.handleControls(clientObj, msg);
  } else if (msg.type === "land") {
    if (clientObj.tutorialStep === "dock_at_port") {
      await handlers.handleTutorialComplete(
        clientObj,
        instances,
        persistenceManager,
        joinRoom,
      );
    } else {
      handlers.handleLand(clientObj, room, persistenceManager);
    }
  } else if (msg.type === "launch") {
    handlers.handleLaunch(clientObj, room);
  } else if (msg.type === "trade") {
    handlers.handleTrade(clientObj, msg, room);
  } else if (msg.type === "port_service") {
    handlers.handlePortService(clientObj, msg);
  } else if (msg.type === "port_refine" || msg.type === "ore_refine") {
    handlers.handleOreRefine(
      clientObj,
      msg.quantity,
      msg.targetCommodity,
      room,
    );
  } else if (msg.type === "jettison") {
    handlers.handleJettison(clientObj, msg, room);
  } else if (msg.type === "outfit_buy") {
    handlers.handleOutfitBuy(
      clientObj,
      msg.outfitName,
      clientObj.planetLandedOn,
      room,
    );
  } else if (msg.type === "outfit_sell") {
    handlers.handleOutfitSell(
      clientObj,
      msg.outfitName,
      clientObj.planetLandedOn,
      room,
    );
  } else if (msg.type === "preset_save") {
    handlers.handlePresetSave(clientObj, msg.presetIndex, msg.presetName);
  } else if (msg.type === "preset_load") {
    handlers.handlePresetLoad(
      clientObj,
      msg.presetIndex,
      clientObj.planetLandedOn,
      room,
    );
  } else if (msg.type === "preset_delete") {
    handlers.handlePresetDelete(clientObj, msg.presetIndex);
  } else if (msg.type === "ship_buy") {
    handlers.handleShipBuy(
      clientObj,
      msg.shipName,
      clientObj.planetLandedOn,
      room,
    );
  } else if (
    msg.type === "squad_invite" ||
    msg.type === "squad_join" ||
    msg.type === "squad_leave"
  ) {
    handlers.handleSquadAction(clientObj, msg, wss, squadManager, pubsub);
  } else if (msg.type === "port_redeem_vouchers") {
    handlers.handleVoucherRedeem(clientObj, room);
  } else if (msg.type === "mission_accept") {
    handlers.handleMissionAccept(
      clientObj,
      msg.planetName,
      msg.missionId,
      clientObj.planetLandedOn,
      room,
    );
  } else if (msg.type === "mission_abandon") {
    handlers.handleMissionAbandon(clientObj, msg.missionId);
  } else if (
    msg.type === "fleet_create" ||
    msg.type === "fleet_join" ||
    msg.type === "fleet_leave"
  ) {
    handlers.handleFleetAction(clientObj, msg, room);
  } else if (msg.type === "chat") {
    await handlers.handleChat(clientObj, msg, room, pubsub, squadManager);
  } else if (msg.type === "warp_jump") {
    handlers.handleWarpJump(clientObj, msg, room);
  } else if (msg.type === "boarding_action") {
    handlers.handleBoardingAction(clientObj, msg, room);
  } else if (msg.type === "escort_command" || msg.type === "escort_formation") {
    handlers.handleEscortAction(clientObj, msg, room);
  } else if (msg.type === "distress_beacon") {
    handlers.handleDistressBeacon(clientObj, room);
  } else if (msg.type === "tutorial_start") {
    await handlers.handleTutorialStart(clientObj, instances, joinRoom);
  } else if (msg.type === "tutorial_progress") {
    handlers.handleTutorialProgress(clientObj, msg);
  } else if (msg.type === "tutorial_complete") {
    handlers.handleTutorialComplete(clientObj, instances, persistenceManager);
  } else if (msg.type === "ping") {
    clientObj.send({
      type: "pong",
      time: msg.time,
    });
  }
}
