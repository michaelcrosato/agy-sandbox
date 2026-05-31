import { Vector2D } from "../physics/Vector2D.js";
import { AIController } from "../engine/ai/AIController.js";
import { applyRepair, applyRefuel } from "../engine/PortServices.js";
import {
  consumeJump,
  validateWarpJump,
  getWarpToll,
  DEFAULT_HYPERDRIVE_OPTIONS,
} from "../engine/Hyperdrive.js";
import {
  plunder,
  boardRepair,
  boardSalvage,
  boardCapture,
} from "../engine/Boarding.js";
import { applyOutfitStats } from "../engine/Outfitting.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";
import {
  tradeOne,
  factionPrice,
  getTransactionTaxRate,
} from "../engine/Trading.js";

const JUMP_FUEL_COST = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost;

/**
 * Handles trade transaction requests (buying/selling commodities) authoritatively.
 * @param {object} clientObj The client object representing the active player connection.
 * @param {object} msg The inbound WebSocket command details.
 * @param {object} room The active server sector instance (room).
 * @returns {void}
 */
export function handleTrade(clientObj, msg, room) {
  if (
    !clientObj ||
    !clientObj.ship ||
    !clientObj.isLanded ||
    !clientObj.planetLandedOn ||
    !room
  ) {
    return;
  }

  const p = clientObj.planetLandedOn;
  let basePrice = p.market[msg.item];
  if (basePrice === undefined) return;

  // SPEC-081: Apply a +50% premium for selling contraband at a Black Market spaceport
  if (
    msg.item === "contraband" &&
    msg.action === "sell" &&
    p.services &&
    p.services.blackMarket
  ) {
    basePrice = Math.round(basePrice * 1.5);
  }

  // spec 016: friendly standing discounts buys / lifts sells at a faction
  // dock; hostile standing does the inverse. No-op without a faction.
  const price = factionPrice(
    basePrice,
    room.factionRegistry,
    clientObj.id,
    p.faction,
    msg.action,
  );

  const taxRate = getTransactionTaxRate(
    room.factionRegistry,
    clientObj.id,
    p.faction,
    p.sector,
  );
  const finalPrice =
    msg.action === "buy"
      ? Math.round(price * (1 + taxRate))
      : Math.max(1, Math.round(price * (1 - taxRate)));

  const result = tradeOne(clientObj.ship, msg.item, msg.action, finalPrice);

  if (result.ok) {
    if (msg.action === "buy") {
      room.economyManager.registerBuy(p.name, msg.item);
    } else {
      room.economyManager.registerSell(p.name, msg.item);
    }

    // spec 032: successful trading at a faction-controlled port nudges standing
    if (room.factionRegistry && p.faction) {
      const TRADE_STANDING_NUDGE = 0.5;
      room.factionRegistry.adjustStanding(
        clientObj.id,
        p.faction,
        TRADE_STANDING_NUDGE,
      );
    }

    if (room.territoryControl && p.sector && p.faction) {
      room.territoryControl.adjustInfluence(p.sector, p.faction, 0.5);
      room.broadcast({
        type: "territory_sync",
        sectors: room.territoryControl.sectors,
      });
    }

    clientObj.send({
      type: "notification",
      message:
        result.reason === "bought"
          ? `Purchased 1 ton of ${msg.item} for ${finalPrice} CR`
          : `Sold 1 ton of ${msg.item} for ${finalPrice} CR`,
      style: "success",
    });
    clientObj.sendStats();
    room.broadcast({
      type: "market_sync",
      planetName: p.name,
      market: p.market,
    });
  } else if (result.reason !== "unknown_action") {
    clientObj.send({
      type: "notification",
      message:
        result.reason === "insufficient_credits"
          ? "Insufficient credits!"
          : result.reason === "cargo_full"
            ? "Cargo hold is full!"
            : `No ${msg.item} in cargo bay!`,
      style: "error",
    });
  }
}

/**
 * Handles spaceport basic services (hulls repair, hyperdrive refueling).
 * @param {object} clientObj The client object representing the active player connection.
 * @param {object} msg The inbound WebSocket command details.
 * @returns {void}
 */
export function handlePortService(clientObj, msg) {
  if (
    !clientObj ||
    !clientObj.ship ||
    !clientObj.isLanded ||
    !clientObj.planetLandedOn
  ) {
    return;
  }

  const services = clientObj.planetLandedOn.services || {};
  if (msg.service === "repair" && services.repair) {
    const r = applyRepair(clientObj.ship);
    clientObj.send({
      type: "notification",
      message: r.ok
        ? `Hull repaired (+${r.repaired} armor) for ${r.cost} CR.`
        : r.cost > 0
          ? "Insufficient credits to repair hull."
          : "Hull is already at full integrity.",
      style: r.ok ? "success" : "error",
    });
    if (r.ok) clientObj.sendStats();
  } else if (msg.service === "refuel" && services.refuel) {
    const r = applyRefuel(clientObj.ship);
    clientObj.send({
      type: "notification",
      message: r.ok
        ? `Hyperdrive refueled (+${r.refueled}) for ${r.cost} CR.`
        : r.cost > 0
          ? "Insufficient credits to refuel."
          : "Hyperdrive fuel is already full.",
      style: r.ok ? "success" : "error",
    });
    if (r.ok) clientObj.sendStats();
  }
}

/**
 * Handles jettisoning cargo commodities into active space cargo pods.
 * @param {object} clientObj The client object representing the active player connection.
 * @param {object} msg The inbound WebSocket command details.
 * @param {object} room The active server sector instance (room).
 * @returns {void}
 */
export function handleJettison(clientObj, msg, room) {
  if (!clientObj || !clientObj.ship || !room) {
    return;
  }

  const pod = room.jettisonFromShip(
    clientObj.ship,
    msg.item,
    Number(msg.amount) || 1,
  );

  if (pod) {
    clientObj.send({
      type: "notification",
      message: `Jettisoned ${pod.amount} ton(s) of ${pod.resourceType}.`,
      style: "info",
    });
    clientObj.sendStats();
  } else {
    clientObj.send({
      type: "notification",
      message: "Nothing to jettison.",
      style: "error",
    });
  }
}

/**
 * Handles warp gate jump traversals to adjacent sectors.
 * @param {object} clientObj The client object representing the active player connection.
 * @param {object} msg The inbound WebSocket command details.
 * @param {object} room The active server sector instance (room).
 * @returns {void}
 */
export function handleWarpJump(clientObj, msg, room) {
  if (!clientObj || !room) {
    return;
  }

  const gate = room.engine.getEntity(msg.gateId);
  const governingFaction = room.getGoverningFaction();
  const val = validateWarpJump(
    clientObj.ship,
    gate,
    JUMP_FUEL_COST,
    room.factionRegistry,
    governingFaction,
    room.engine.entities,
  );

  if (!val.ok) {
    clientObj.send({
      type: "notification",
      message: val.reason,
      style: "error",
    });
    return;
  }

  const toll = getWarpToll(
    clientObj.ship,
    room.factionRegistry,
    governingFaction,
  );

  consumeJump(clientObj.ship, JUMP_FUEL_COST);
  if (toll > 0) {
    clientObj.ship.credits = Math.max(0, clientObj.ship.credits - toll);
  }

  clientObj.ship.position = gate.targetPosition.clone();
  clientObj.ship.velocity = new Vector2D(0, 0);

  clientObj.send({
    type: "warp_success",
    targetSector: gate.targetSector,
    position: { x: gate.targetPosition.x, y: gate.targetPosition.y },
    hyperFuel: clientObj.ship.hyperFuel,
  });

  clientObj.send({
    type: "notification",
    message: `Hyperspace drive engaged! Warp transition to ${gate.targetSector.toUpperCase()} Sector completed.`,
    style: "success",
  });

  let escortCount = 0;
  for (const ai of room.ais) {
    if (ai.role === "escort" && ai.flagship === clientObj.ship) {
      ai.ship.position = gate.targetPosition.add(
        new Vector2D((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100),
      );
      ai.ship.velocity = new Vector2D(0, 0);
      escortCount++;
    }
  }

  if (escortCount > 0) {
    clientObj.send({
      type: "notification",
      message: `${escortCount} AI escorts made the hyperspace jump with you.`,
      style: "info",
    });
  }

  clientObj.sendStats();
  room.broadcastRosterUpdate();
}

/**
 * Handles specialized boarding actions (plundering, repairing hulks, module salvage, scuttling, capturing escorts).
 * @param {object} clientObj The client object representing the active player connection.
 * @param {object} msg The inbound WebSocket command details.
 * @param {object} room The active server sector instance (room).
 * @returns {void}
 */
export function handleBoardingAction(clientObj, msg, room) {
  if (!clientObj || !room) {
    return;
  }

  const target = room.engine.getEntity(msg.targetId);
  if (!target || target.type !== "ship" || !target.isDisabled) {
    clientObj.send({
      type: "notification",
      message: "Target invalid or not disabled!",
      style: "error",
    });
    return;
  }

  const dist = clientObj.ship.position.distance(target.position);
  if (dist > 250) {
    clientObj.send({
      type: "notification",
      message: "Target too far for boarding! Move within 250u.",
      style: "error",
    });
    return;
  }

  if (msg.action === "plunder") {
    const result = plunder(clientObj.ship, target, {
      boardRange: 250,
      maxBoardSpeed: Number.POSITIVE_INFINITY,
    });
    if (result.ok) {
      const tons = Object.values(result.cargo).reduce((a, b) => a + b, 0);
      clientObj.send({
        type: "notification",
        message: `Plundered ${tons} ton(s) of cargo and ${result.credits.toLocaleString()} CR.`,
        style: "success",
      });
      clientObj.sendStats();
    } else {
      clientObj.send({
        type: "notification",
        message: "Nothing to plunder — this hulk has already been stripped.",
        style: "info",
      });
    }
  } else if (msg.action === "repair") {
    const result = boardRepair(clientObj.ship, target, {
      boardRange: 250,
      maxBoardSpeed: Number.POSITIVE_INFINITY,
    });
    if (result.ok) {
      clientObj.send({
        type: "notification",
        message: `Boarding repair complete: restored ${result.repaired} armor and revived the ship.`,
        style: "success",
      });
    } else {
      clientObj.send({
        type: "notification",
        message: "Cannot repair: target is not boardable.",
        style: "error",
      });
    }
  } else if (msg.action === "salvage") {
    const result = boardSalvage(clientObj.ship, target);
    if (result.ok) {
      if (result.salvaged) {
        const match = DEFAULT_OUTFITS.find((o) => o.name === result.salvaged);
        if (match) applyOutfitStats(clientObj.ship, match);

        clientObj.send({
          type: "notification",
          message: `Hull Component Salvaged! Equipped: ${result.salvaged}`,
          style: "success",
        });
      } else {
        clientObj.send({
          type: "notification",
          message: `No new modules found. Salvaged scrap for +${result.credits} CR.`,
          style: "info",
        });
      }
      clientObj.sendStats();
    }
  } else if (msg.action === "capture") {
    const result = boardCapture(clientObj.ship, target, 1500);
    if (!result.ok) {
      clientObj.send({
        type: "notification",
        message: result.reason,
        style: "error",
      });
      return;
    }

    target.name = `${clientObj.nickname}'s Escort`;

    const controller = new AIController(target, "escort", {
      useUtilityAdvisor: true,
    });
    controller.flagship = clientObj.ship;
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `Neural Command Link Established! Escort active.`,
      style: "success",
    });
    clientObj.sendStats();
  } else if (msg.action === "scuttle") {
    const scrapReward = Math.floor(target.maxArmor * 4 + Math.random() * 200);
    clientObj.ship.credits += scrapReward;
    room.engine.removeEntity(target.id);

    clientObj.send({
      type: "notification",
      message: `Hull scuttled. Salvaged scrap for +${scrapReward} CR`,
      style: "success",
    });
    clientObj.sendStats();
  }

  room.broadcastRosterUpdate();
}
