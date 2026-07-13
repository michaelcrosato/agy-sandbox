import {
  updateAILogic,
  applyTractorForces,
  handleCargoCollection,
  applyNebulaHazards,
  applyCosmicStormHazards,
  applySolarEmpHazards,
} from "./physicsTickHandlers.js";
import { broadcastRoomState } from "./roomBroadcast.js";

/**
 * Executes a single authoritative physics and simulation tick for a given room.
 * @param {Object} room The GameInstance room.
 * @param {number} dt The simulation tick time delta.
 * @param {Object} options Options containing metrics, observers, and config settings.
 * @param {Object} options.squadManager
 * @param {Object} options.latencyMonitor
 * @param {Object} options.metrics
 * @param {boolean} options.interestEnabled
 * @param {number} options.interestRadius
 * @param {boolean} options.binaryProtocol
 */
export function processPhysicsTickForRoom(
  room,
  dt,
  {
    squadManager,
    latencyMonitor,
    metrics,
    interestEnabled,
    interestRadius,
    binaryProtocol,
  },
) {
  // A. Drive AI merchant itineraries and update active AIs
  const prevOres = new Map(room.planets.map((p) => [p.name, p.market.ore]));

  updateAILogic(room, dt);

  for (const p of room.planets) {
    const prevVal = prevOres.get(p.name);
    if (prevVal !== undefined && p.market.ore !== prevVal) {
      room.broadcast({
        type: "market_sync",
        planetName: p.name,
        market: p.market,
      });
    }
  }

  // B. Apply Solar EMP, Tractor, Cargo, Nebulae, and Cosmic Storm Hazards
  const originalRegens = new Map();
  const originalCooldowns = new Map();

  applySolarEmpHazards(room, originalRegens);
  applyTractorForces(room);
  handleCargoCollection(room);
  applyNebulaHazards(room, originalRegens);
  applyCosmicStormHazards(room, dt, originalCooldowns);

  // F. Scramble aggressive interceptor patrols for hostile players
  if (typeof room.checkReputationPatrolSpawns === "function") {
    room.checkReputationPatrolSpawns(dt);
  }
  if (typeof room.checkEliteHunterSpawns === "function") {
    room.checkEliteHunterSpawns(dt);
  }
  if (typeof room.checkEscortAmbushSpawns === "function") {
    room.checkEscortAmbushSpawns(dt);
  }
  if (typeof room.checkContrabandSpaceScans === "function") {
    room.checkContrabandSpaceScans(dt);
  }

  // G. Update local room physical kinematics
  if (room.engine && typeof room.engine.update === "function") {
    room.engine.update(dt);
  }

  // Audit physics loop determinism (SPEC-123)
  if (
    room.determinismSentry &&
    typeof room.determinismSentry.audit === "function"
  ) {
    room.determinismSentry.audit(room);
  }

  // G. Restore shield regens and weapon cooldowns
  for (const [ship, origRegen] of originalRegens.entries()) {
    ship.shieldRegen = origRegen;
  }
  for (const [ship, origCooldown] of originalCooldowns.entries()) {
    ship.weaponCooldown = origCooldown;
  }

  // H. Replenish Asteroids
  if (
    room.engine &&
    Array.isArray(room.engine.entities) &&
    typeof room.spawnNewAsteroid === "function"
  ) {
    const activeAsteroids = room.engine.entities.filter(
      (e) => e.type === "generic" || e.type === "gem_asteroid",
    );
    if (activeAsteroids.length < 35) {
      room.spawnNewAsteroid(false);
    }
  }

  // I. Update active fleets coordinates
  if (room.fleets && typeof room.broadcastFleetUpdate === "function") {
    for (const code of room.fleets.keys()) {
      room.broadcastFleetUpdate(code);
    }
  }

  // K. Tick down sector-wide Galaxy Dynamic Economic Events (SPEC-057)
  if (room.galaxyEventsManager && room.galaxyEventsManager.activeEvent) {
    const expired = room.galaxyEventsManager.tick(dt);
    if (expired) {
      // Restore all planet prices to pre-event values
      for (const p of room.planets) {
        if (p.preEventMarket) {
          p.market = { ...p.preEventMarket };
          delete p.preEventMarket;
        }
      }

      // Broadcast event clear
      room.broadcast({
        type: "galaxy_event_announcement",
        event: null,
      });

      const alertMsg = `GALAXY SHOCK OVER: The dynamic economic shock has subsided. Sector markets returned to baseline.`;
      room.broadcastNotification(alertMsg, "success");

      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ECONOMY",
        text: alertMsg,
      };
      for (const c of room.clients.values()) {
        c.send(chatPayload);
      }

      // Broadcast market synchronizations
      for (const p of room.planets) {
        room.broadcast({
          type: "market_sync",
          planetName: p.name,
          market: p.market,
        });
      }
    }
  }

  // J. Authoritative World State Broadcast (P7: snapshots + deltas)
  broadcastRoomState(room, {
    squadManager,
    latencyMonitor,
    metrics,
    interestEnabled,
    interestRadius,
    binaryProtocol,
  });
}
