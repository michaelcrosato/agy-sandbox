import { Vector2D } from "../physics/Vector2D.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";
import { createSeededRng } from "../engine/NameGenerator.js";
import { DEFAULT_GENERATIVE_OPTIONS } from "../engine/GenerativeMissions.js";

/**
 * Handles the "controls" message: updates ship controls and heading.
 *
 * @param {object} clientObj - The authenticated client object.
 * @param {object} msg - The controls payload.
 */
export function handleControls(clientObj, msg) {
  if (clientObj.ship && !clientObj.isLanded && !clientObj.ship.isDestroyed) {
    clientObj.ship.setControls(msg.controls);
    clientObj.ship.heading = msg.heading;
  }
}

/**
 * Handles the "land" message: docking on a planet, contraband scans,
 * mission completion, mission generation, and state saving.
 *
 * @param {object} clientObj - The authenticated client object.
 * @param {object} room - The current GameInstance room.
 * @param {object} persistenceManager - The PersistenceManager instance.
 */
export function handleLand(clientObj, room, persistenceManager) {
  if (
    !clientObj.ship ||
    clientObj.isLanded ||
    clientObj.ship.isDestroyed ||
    !room
  ) {
    return;
  }

  const targetPlanet = room.planets.find((p) => p.canLand(clientObj.ship));
  if (!targetPlanet) {
    clientObj.send({
      type: "notification",
      message:
        "Cannot land here. Travel within trigger radius at low speed (< 80 u/s).",
      style: "error",
    });
    return;
  }

  // spec 016: refuse docking when the player's standing with the
  // planet's controlling faction is hostile.
  if (
    room.factionRegistry &&
    targetPlanet.faction &&
    !room.factionRegistry.dockingPermitted(clientObj.id, targetPlanet.faction)
  ) {
    clientObj.send({
      type: "notification",
      message: `Docking refused at ${targetPlanet.name}: ${targetPlanet.faction} considers you hostile.`,
      style: "error",
    });
    return;
  }

  // SPEC-081: refuse docking at Black Market ports if underworld standing is negative
  if (
    room.factionRegistry &&
    targetPlanet.faction &&
    targetPlanet.services &&
    targetPlanet.services.blackMarket
  ) {
    const standing = room.factionRegistry.getStanding(
      clientObj.id,
      targetPlanet.faction,
    );
    if (standing < 0) {
      clientObj.send({
        type: "notification",
        message: `Access Denied — Underworld Hostility: ${targetPlanet.faction} faction requires at least neutral standing.`,
        style: "error",
      });
      return;
    }
  }

  // --- Mission arrival completions ---
  const completed = clientObj.missionManager.checkArrivalCompletions(
    targetPlanet.name,
    clientObj.ship,
    room,
  );

  for (const m of completed) {
    if (room.territoryControl && targetPlanet.sector && targetPlanet.faction) {
      room.territoryControl.adjustInfluence(
        targetPlanet.sector,
        targetPlanet.faction,
        10.0,
      );
      room.broadcast({
        type: "territory_sync",
        sectors: room.territoryControl.sectors,
      });
    }

    if (m.promotionMessage) {
      clientObj.send({
        type: "notification",
        message: m.promotionMessage,
        style: "success",
      });
    }

    if (m.generated) {
      if (m.marketChanges && m.marketChanges.length > 0) {
        for (const change of m.marketChanges) {
          const alertMsg = `GALAXY NEWS: ${clientObj.nickname} delivered cargo to ${change.planetName}. Price of ${change.commodity} shifted from ${change.before.toFixed(0)} to ${change.after.toFixed(0)} CR!`;
          room.broadcastNotification(alertMsg, "info");
          room.broadcast({
            type: "chat",
            channel: "global",
            sender: "GALAXY-NEWS",
            text: alertMsg,
          });
          room.broadcast({
            type: "market_sync",
            planetName: change.planetName,
            market: targetPlanet.market,
          });
        }
      }
      if (m.factionChanges && m.factionChanges.length > 0) {
        for (const change of m.factionChanges) {
          const formattedDelta =
            change.delta >= 0
              ? `+${change.delta.toFixed(1)}`
              : change.delta.toFixed(1);
          clientObj.send({
            type: "notification",
            message: `Standing with ${change.faction}: ${formattedDelta} merits!`,
            style: change.delta >= 0 ? "success" : "error",
          });
        }
      }
    }

    if (clientObj.fleetName) {
      const fleetSet = room.fleets.get(clientObj.fleetName);
      if (fleetSet && fleetSet.size > 1) {
        const share = Math.floor(m.reward / fleetSet.size);
        clientObj.ship.credits -= m.reward;
        for (const member of fleetSet) {
          if (member.ship) {
            member.ship.credits += share;
            member.send({
              type: "notification",
              message: `Fleet Contract Completed: ${m.title} by ${clientObj.nickname}! Share: +${share.toLocaleString()} CR`,
              style: "success",
            });
            member.sendStats();
          }
        }
        continue;
      }
    }

    clientObj.send({
      type: "notification",
      message: `Contract Completed: ${m.title}! Received +${m.reward.toLocaleString()} CR`,
      style: "success",
    });
  }

  // --- Contraband scan ---
  if (
    targetPlanet.name !== "Rogue's Hollow" &&
    clientObj.ship.cargo.contraband > 0
  ) {
    let bestJammerValue = 0;
    if (clientObj.ship.outfits) {
      for (const outfitName of clientObj.ship.outfits) {
        const spec = DEFAULT_OUTFITS.find((o) => o.name === outfitName);
        if (spec && spec.type === "jammer") {
          if (spec.value > bestJammerValue) {
            bestJammerValue = spec.value;
          }
        }
      }
    }

    let scanDetected = true;
    if (bestJammerValue > 0) {
      const rng = clientObj.ship.rng || Math.random;
      if (rng() < bestJammerValue) {
        scanDetected = false;
      }
    }

    if (scanDetected) {
      clientObj.ship.cargo.contraband = 0;
      clientObj.ship.credits = Math.max(0, clientObj.ship.credits - 1500);
      clientObj.send({
        type: "notification",
        message:
          "Security Scan: Contraband detected! Confiscated and fined 1,500 CR.",
        style: "error",
      });
    } else {
      clientObj.send({
        type: "notification",
        message: "Security Scan: Contraband jamming successful! Scan bypassed.",
        style: "success",
      });
    }
  }

  // --- Complete docking ---
  clientObj.isLanded = true;
  clientObj.planetLandedOn = targetPlanet;
  clientObj.ship.velocity = new Vector2D(0, 0);
  clientObj.ship.clearControls();
  clientObj.ship.hyperFuel = clientObj.ship.maxHyperFuel;
  room.engine.removeEntity(clientObj.id);

  // Generate available missions authoritatively on the server
  if (
    clientObj.missionManager &&
    clientObj.missionManager.availableMissions &&
    !clientObj.missionManager.availableMissions[targetPlanet.name]
  ) {
    const bountyTargets =
      room && room.ships && typeof room.ships.values === "function"
        ? Array.from(room.ships.values())
            .filter(
              (s) =>
                s &&
                s.type === "ship" &&
                s.id !== clientObj.id &&
                s.bountyValue,
            )
            .map((s) => ({
              id: s.id,
              name: s.name,
              bountyValue: s.bountyValue,
              faction: s.faction,
            }))
        : [];

    const world = {
      planets: room.planets,
      baseMarkets: room.baseMarkets || {},
      bountyTargets: bountyTargets,
      factionRegistry: room.factionRegistry,
      playerId: clientObj.id,
    };

    const options = {
      rng: createSeededRng(Math.floor(Date.now() + Math.random() * 100000)),
      ...DEFAULT_GENERATIVE_OPTIONS,
    };

    let generated = [];
    if (typeof clientObj.missionManager.generateWorldMissions === "function") {
      generated = clientObj.missionManager.generateWorldMissions(
        targetPlanet.name,
        world,
        options,
      );
    }

    if (
      generated.length === 0 &&
      typeof clientObj.missionManager.generateMissionsForPlanet === "function"
    ) {
      clientObj.missionManager.generateMissionsForPlanet(
        targetPlanet.name,
        room.planets,
        room.factionRegistry,
        clientObj.id,
      );
    }
  }

  const available =
    clientObj.missionManager && clientObj.missionManager.availableMissions
      ? clientObj.missionManager.availableMissions[targetPlanet.name]
      : [];

  clientObj.send({
    type: "landed",
    planetName: targetPlanet.name,
    availableMissions: available,
  });
  clientObj.send({
    type: "notification",
    message: `Landed safely on ${targetPlanet.name}. Ship systems secured.`,
    style: "success",
  });
  clientObj.sendStats();
  room.broadcastRosterUpdate();

  // Docking is a natural save-point: state is stable and trades have
  // just happened. Fire-and-forget; errors are swallowed by the manager.
  if (persistenceManager) {
    persistenceManager.savePlayer(clientObj.id, clientObj, room.id);
  }
}

/**
 * Handles the "launch" message: taking off from a planet, repositioning ship.
 *
 * @param {object} clientObj - The authenticated client object.
 * @param {object} room - The current GameInstance room.
 */
export function handleLaunch(clientObj, room) {
  if (!clientObj.ship || !clientObj.isLanded || !room) return;

  const p = clientObj.planetLandedOn;
  clientObj.isLanded = false;
  clientObj.planetLandedOn = null;

  clientObj.ship.position = p.position.add(
    new Vector2D(0, p.landingRadius + 40),
  );
  clientObj.ship.velocity = new Vector2D(0, 0);
  clientObj.ship.clearControls();
  room.engine.addEntity(clientObj.ship);

  clientObj.send({ type: "launched" });
  clientObj.send({
    type: "notification",
    message: "Launch sequence completed! Thrusters online.",
    style: "success",
  });
  clientObj.sendStats();
  room.broadcastRosterUpdate();
}
