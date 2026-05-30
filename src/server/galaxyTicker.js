import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "../engine/Ship.js";
import { AIController } from "../engine/ai/AIController.js";
import { InvariantVerifier } from "../engine/InvariantVerifier.js";
import { createLogger } from "../net/logger.js";

const envLogLevel = process.env.LOG_LEVEL;
const logLevel =
  envLogLevel === "error" ||
  envLogLevel === "debug" ||
  envLogLevel === "info" ||
  envLogLevel === "warn"
    ? envLogLevel
    : "info";
const logger = createLogger({ level: logLevel });

/**
 * Executes the economy tick (shortage/surplus events) for a room.
 * @param {Object} room
 */
export function runEconomyTickForRoom(room) {
  // Sector-wide Dynamic Galaxy Economic Events scheduling check (SPEC-057)
  if (room.galaxyEventsManager && !room.galaxyEventsManager.activeEvent) {
    // 30% probability of triggering a dynamic economic event
    if (Math.random() < 0.3) {
      const ev = room.galaxyEventsManager.triggerEvent();

      if (room.chronicle) {
        room.chronicle.recordEvent({
          sector: room.id,
          category: "economy",
          title: `Dynamic Shock: ${ev.name}`,
          description: ev.description,
          impactMetrics: ev.priceModifiers,
        });
      }

      // Save pre-event market prices so we can restore them exactly upon expiration
      for (const p of room.planets) {
        p.preEventMarket = { ...p.market };
        // Apply multipliers to the current market prices
        for (const [commodity, modifier] of Object.entries(ev.priceModifiers)) {
          if (p.market[commodity] !== undefined) {
            p.market[commodity] = Math.max(
              1,
              Math.round(p.market[commodity] * modifier),
            );
          }
        }
      }

      // Broadcast announcement and notifications
      room.broadcast({
        type: "galaxy_event_announcement",
        event: ev,
      });

      const alertMsg = `GALAXY SHOCK ALERT: ${ev.name} is affecting the sector! ${ev.description}`;
      room.broadcastNotification(alertMsg, "error");

      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ECONOMY",
        text: alertMsg,
      };
      for (const c of room.clients.values()) {
        c.send(chatPayload);
      }

      // Sync markets for all planets
      for (const p of room.planets) {
        room.broadcast({
          type: "market_sync",
          planetName: p.name,
          market: p.market,
        });
      }
    }
  }

  if (room.economyManager.activeEconomicEvent) {
    const prevPlanetName = room.economyManager.activeEconomicEvent.planetName;
    const prevPlanet = room.planets.find((p) => p.name === prevPlanetName);
    room.economyManager.clearActiveEvent();
    if (prevPlanet) {
      room.broadcast({
        type: "market_sync",
        planetName: prevPlanet.name,
        market: prevPlanet.market,
      });
    }
  }

  const event = room.economyManager.triggerRandomEvent();
  if (!event) return;

  const targetPlanet = room.planets.find((p) => p.name === event.planetName);
  if (targetPlanet) {
    room.broadcast({
      type: "market_sync",
      planetName: event.planetName,
      market: targetPlanet.market,
    });
  }

  const formattedMsg = event.isShortage
    ? `MARKET ALERT: ${event.planetName} reports severe ${event.commodity.toUpperCase()} shortage! Prices soared to ${event.newPrice} CR!`
    : `MARKET ALERT: ${event.planetName} reports massive ${event.commodity.toUpperCase()} surplus! Prices dropped to ${event.newPrice} CR!`;

  room.broadcastNotification(
    formattedMsg,
    event.isShortage ? "error" : "success",
  );

  if (room.chronicle) {
    room.chronicle.recordEvent({
      sector: room.id,
      category: "economy",
      title: event.isShortage
        ? `Shortage: ${event.commodity}`
        : `Surplus: ${event.commodity}`,
      description: formattedMsg,
      impactMetrics: {
        planet: event.planetName,
        commodity: event.commodity,
        price: event.newPrice,
      },
    });
  }

  const chatPayload = {
    type: "chat",
    channel: "global",
    sender: "SYSTEM-ECONOMY",
    text: formattedMsg,
  };
  for (const c of room.clients.values()) {
    c.send(chatPayload);
  }
}

/**
 * Broadcasts active event synchronization data for a room.
 * @param {Object} room
 */
export function broadcastEventSyncForRoom(room) {
  const eventPayload = {
    type: "event_sync",
    event: room.activeSectorEvent
      ? {
          type: room.activeSectorEvent.type,
          planetName: room.activeSectorEvent.planetName,
        }
      : null,
  };
  room.broadcast(eventPayload);
}

/**
 * Executes environmental siege / EMP event ticks for a room.
 * @param {Object} room
 */
export function runSectorEventTickForRoom(room) {
  if (room.activeSectorEvent) {
    if (room.activeSectorEvent.type === "siege") {
      for (const shipId of room.activeSectorEvent.spawnedShipIds) {
        const ent = room.engine.entities.find((e) => e.id === shipId);
        if (ent) {
          room.engine.removeEntity(ent);
        }
        const aiIdx = room.ais.findIndex((a) => a.ship.id === shipId);
        if (aiIdx !== -1) {
          room.ais.splice(aiIdx, 1);
        }
      }

      const formattedMsg = `EVENT OVER: The Pirate Siege at ${room.activeSectorEvent.planetName} has been repelled!`;
      room.broadcastNotification(formattedMsg, "success");

      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg,
      };
      room.broadcast(chatPayload);
    } else if (room.activeSectorEvent.type === "emp") {
      const formattedMsg = `EVENT OVER: The Solar EMP Ion Storm at ${room.activeSectorEvent.planetName} has subsided.`;
      room.broadcastNotification(formattedMsg, "success");

      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg,
      };
      room.broadcast(chatPayload);
    }
    room.activeSectorEvent = null;
  }

  const eventTypes = ["siege", "emp"];
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  let targetPlanet;
  if (eventType === "emp") {
    const nonSolPlanets = room.planets.filter((p) => p.name !== "Sol");
    targetPlanet =
      nonSolPlanets[Math.floor(Math.random() * nonSolPlanets.length)];
  } else {
    targetPlanet =
      room.planets[Math.floor(Math.random() * room.planets.length)];
  }

  if (!targetPlanet) return;

  if (eventType === "siege") {
    const spawnedShipIds = [];
    const count = 2;

    for (let i = 0; i < count; i++) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = targetPlanet.landingRadius + 180 + Math.random() * 50;
      const spawnPos = targetPlanet.position.add(
        new Vector2D(
          Math.cos(spawnAngle) * spawnDist,
          Math.sin(spawnAngle) * spawnDist,
        ),
      );
      const shipId =
        "siege-raider-" + Math.random().toString(36).substring(2, 9);

      const raiderShip = new Ship({
        id: shipId,
        name: "Siege Raider",
        position: spawnPos,
        velocity: new Vector2D(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30,
        ),
        heading: Math.random() * Math.PI * 2,
        maxShield: 500,
        maxArmor: 350,
        thrustPower: 18000,
        turnRate: 2.2,
        weaponDamage: 30,
        weaponCooldown: 0.25,
      });
      raiderShip.role = "pirate";

      const controller = new AIController(raiderShip, "pirate", {
        useUtilityAdvisor: true,
      });
      room.engine.addEntity(raiderShip);
      room.ais.push(controller);
      spawnedShipIds.push(shipId);
    }

    room.activeSectorEvent = {
      type: "siege",
      planetName: targetPlanet.name,
      spawnedShipIds: spawnedShipIds,
    };

    const formattedMsg = `RED ALERT: Pirate Siege detected at ${targetPlanet.name}! Heavy raiders are attacking the trade hub!`;
    room.broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg,
    };
    room.broadcast(chatPayload);
  } else if (eventType === "emp") {
    room.activeSectorEvent = {
      type: "emp",
      planetName: targetPlanet.name,
      spawnedShipIds: [],
    };

    const formattedMsg = `ENVIRONMENT ALERT: Solar EMP Ion Storm detected at ${targetPlanet.name}! Shield regeneration disabled within 400u!`;
    room.broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg,
    };
    room.broadcast(chatPayload);
  }

  broadcastEventSyncForRoom(room);
}

/**
 * Normalizes prices for active planets in a room.
 * @param {Object} room
 */
export function runEconomyNormalizationForRoom(room) {
  const changedPlanets = room.economyManager.normalizePrices(
    room.galaxyEventsManager,
  );
  for (const p of changedPlanets) {
    room.broadcast({
      type: "market_sync",
      planetName: p.name,
      market: p.market,
    });
  }
}

/**
 * Executes shortages/surpluses ticks across all rooms.
 * @param {Map} instances
 */
export function runEconomyShortageInterval(instances) {
  for (const room of instances.values()) {
    runEconomyTickForRoom(room);
  }
}

/**
 * Executes environmental siege ticks across all rooms.
 * @param {Map} instances
 */
export function runEnvironmentalSiegeInterval(instances) {
  for (const room of instances.values()) {
    runSectorEventTickForRoom(room);
  }
}

/**
 * Executes price normalization ticks across all rooms.
 * @param {Map} instances
 */
export function runEconomyNormalizationInterval(instances) {
  for (const room of instances.values()) {
    runEconomyNormalizationForRoom(room);
  }
}

/**
 * Executes periodic galaxy heartbeats aging economic chains and decaying standings.
 * @param {Map} instances
 */
export function runGalaxyHeartbeatInterval(instances) {
  for (const room of instances.values()) {
    // Audit-Driven Invariant Verification and Self-Healing (SPEC-091)
    InvariantVerifier.verify(room, logger);

    const changedNames = room.galaxyHeartbeat.pulse();
    room.decayReputations();
    for (const name of changedNames) {
      const planet = room.planets.find((p) => p.name === name);
      if (planet) {
        room.broadcast({
          type: "market_sync",
          planetName: planet.name,
          market: planet.market,
        });
      }
    }
  }
}
