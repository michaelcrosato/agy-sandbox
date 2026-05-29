import { FactionRegistry } from "../engine/FactionRegistry.js";

/**
 * Persistence serializers (P1).
 *
 * Pure, side-effect-free helpers that translate the live in-memory `GameInstance`
 * and per-client objects into plain JSON-safe shapes (and back). These shapes
 * are what the swappable `Store` writes and reads — keeping the conversion
 * out of the store keeps both layers small and independently testable.
 *
 * The contract that matters for P1 restart-survival:
 *   `applyGalaxy(instanceB, serializeGalaxy(instanceA))`
 *   leaves B's markets, events, heartbeat pulses, and faction state equal to A's.
 *   `applyPlayer(clientB, serializePlayer(clientA))`
 *   leaves B's credits, cargo, outfits, hull stats, mission progress, etc. equal to A's.
 *
 * Nothing in here touches sockets, the filesystem, or `Math.random`. All inputs
 * are passed in; missing pieces are tolerated so partial snapshots restore
 * gracefully.
 */

/**
 * Snapshot version. Bumped if/when a schema-breaking change ships so that a
 * loader can refuse data it can't safely interpret.
 */
export const SNAPSHOT_VERSION = 1;

/** Hull stat fields persisted with a player ship snapshot. */
const PLAYER_HULL_FIELDS = Object.freeze([
  "name",
  "maxShield",
  "shield",
  "maxArmor",
  "armor",
  "shieldRegen",
  "maxEnergy",
  "energy",
  "energyRegen",
  "maxHeat",
  "heat",
  "heatDissipation",
  "maxHyperFuel",
  "hyperFuel",
  "thrustPower",
  "brakePower",
  "turnRate",
  "maxSpeed",
  "weaponDamage",
  "weaponRange",
  "weaponSpeed",
  "weaponCooldown",
  "cargoCapacity",
  "hullMass",
  "outfitMass",
]);

/**
 * Captures a JSON-safe snapshot of the simulated galaxy. Includes:
 *   - per-planet markets (post-heartbeat-aging),
 *   - active economic event (from `economyManager`) and active sector event,
 *   - the heartbeat's pulse counter, so wall-clock-style age is preserved,
 *   - the faction registry's state, when one is attached.
 *
 * The output is a plain object with no class instances or live references,
 * so it round-trips cleanly through `JSON.stringify` and any `Store`.
 *
 * @param {Object} gameInstance - Live `GameInstance` (or any compatible shape
 *   exposing `planets`, `economyManager`, `activeSectorEvent`, `galaxyHeartbeat`,
 *   and optionally `factionRegistry`).
 * @returns {Object} Galaxy snapshot.
 */
export function serializeGalaxy(gameInstance) {
  if (!gameInstance) {
    return { version: SNAPSHOT_VERSION, planets: [] };
  }

  const planets = Array.isArray(gameInstance.planets)
    ? gameInstance.planets.map((planet) => ({
        name: planet.name,
        market: planet.market ? { ...planet.market } : {},
      }))
    : [];

  const activeEconomicEvent =
    gameInstance.economyManager &&
    gameInstance.economyManager.activeEconomicEvent
      ? { ...gameInstance.economyManager.activeEconomicEvent }
      : null;
  const eventDurationTimer = gameInstance.economyManager
    ? gameInstance.economyManager.eventDurationTimer || 0
    : 0;

  const activeSectorEvent = gameInstance.activeSectorEvent
    ? cloneSectorEvent(gameInstance.activeSectorEvent)
    : null;

  const heartbeatPulses =
    gameInstance.galaxyHeartbeat &&
    Number.isFinite(gameInstance.galaxyHeartbeat.pulses)
      ? gameInstance.galaxyHeartbeat.pulses
      : 0;

  const factionRegistry =
    gameInstance.factionRegistry &&
    typeof gameInstance.factionRegistry.serialize === "function"
      ? gameInstance.factionRegistry.serialize()
      : null;

  return {
    version: SNAPSHOT_VERSION,
    planets,
    activeEconomicEvent,
    eventDurationTimer,
    activeSectorEvent,
    heartbeatPulses,
    factionRegistry,
  };
}

/**
 * Restores a galaxy snapshot onto a (compatible) `GameInstance`. Mutates the
 * passed-in instance in place; does not create new planets or rewire engine
 * entities. Planets present in `data` but missing from the instance are
 * silently skipped, so a snapshot taken from an older seed never breaks load.
 *
 * After this call, the round-trip property holds: any field captured by
 * {@link serializeGalaxy} reads back as the same value on the target.
 *
 * @param {Object} gameInstance - Target `GameInstance` to mutate.
 * @param {Object} data - Snapshot from {@link serializeGalaxy}.
 * @returns {void}
 */
export function applyGalaxy(gameInstance, data) {
  if (!gameInstance || !data) return;

  if (Array.isArray(data.planets) && Array.isArray(gameInstance.planets)) {
    const byName = new Map(gameInstance.planets.map((p) => [p.name, p]));
    for (const snapshot of data.planets) {
      const planet = byName.get(snapshot.name);
      if (!planet) continue;
      if (snapshot.market && typeof snapshot.market === "object") {
        planet.market = { ...snapshot.market };
      }
    }
  }

  if (gameInstance.economyManager) {
    gameInstance.economyManager.activeEconomicEvent = data.activeEconomicEvent
      ? { ...data.activeEconomicEvent }
      : null;
    gameInstance.economyManager.eventDurationTimer = Number.isFinite(
      data.eventDurationTimer,
    )
      ? data.eventDurationTimer
      : 0;
  }

  gameInstance.activeSectorEvent = data.activeSectorEvent
    ? cloneSectorEvent(data.activeSectorEvent)
    : null;

  if (gameInstance.galaxyHeartbeat && Number.isFinite(data.heartbeatPulses)) {
    gameInstance.galaxyHeartbeat.pulses = data.heartbeatPulses;
  }

  if (data.factionRegistry) {
    if (
      gameInstance.factionRegistry &&
      typeof gameInstance.factionRegistry.serialize === "function"
    ) {
      // Overwrite live fields in place so any references held elsewhere
      // (e.g. AI policies) still observe the restored values.
      const fresh = FactionRegistry.fromJSON(data.factionRegistry);
      gameInstance.factionRegistry.factions = fresh.factions;
      gameInstance.factionRegistry.relations = fresh.relations;
      gameInstance.factionRegistry.options = fresh.options;
      gameInstance.factionRegistry.standings = fresh.standings;
    } else {
      gameInstance.factionRegistry = FactionRegistry.fromJSON(
        data.factionRegistry,
      );
    }
  }
}

/**
 * Captures a JSON-safe snapshot of a player session. Includes everything that
 * has to survive a restart: nickname, credits, cargo, outfits, hull stats,
 * weapon shield-pierce, and the mission manager's active/available/completed
 * state.
 *
 * The input may be either a live server `clientObj` (with `nickname`, `ship`,
 * `missionManager`) or any compatible shape — missing pieces produce a
 * partial snapshot rather than throwing.
 *
 * @param {Object} clientObj - Player session.
 * @returns {Object} Player snapshot.
 */
export function serializePlayer(clientObj) {
  if (!clientObj) {
    return { version: SNAPSHOT_VERSION };
  }

  const ship = clientObj.ship || null;
  const shipSnapshot = ship
    ? {
        credits: Number.isFinite(ship.credits) ? ship.credits : 0,
        cargo: ship.cargo ? { ...ship.cargo } : {},
        outfits: Array.isArray(ship.outfits) ? [...ship.outfits] : [],
        weaponShieldPierce: Number.isFinite(ship.weaponShieldPierce)
          ? ship.weaponShieldPierce
          : 0,
        hull: pickFields(ship, PLAYER_HULL_FIELDS),
      }
    : null;

  const missionSnapshot = clientObj.missionManager
    ? serializeMissions(clientObj.missionManager)
    : null;

  return {
    version: SNAPSHOT_VERSION,
    id: clientObj.id || null,
    nickname: clientObj.nickname || null,
    ship: shipSnapshot,
    missions: missionSnapshot,
  };
}

/**
 * Restores a player snapshot onto a (compatible) live client object. Mutates
 * the target's ship and mission manager in place rather than swapping the
 * references, so engine entities and event listeners continue to function.
 *
 * @param {Object} clientObj - Target player session.
 * @param {Object} data - Snapshot from {@link serializePlayer}.
 * @returns {void}
 */
export function applyPlayer(clientObj, data) {
  if (!clientObj || !data) return;

  if (typeof data.nickname === "string") {
    clientObj.nickname = data.nickname;
  }
  if (typeof data.id === "string" && data.id) {
    clientObj.id = data.id;
  }

  if (data.ship && clientObj.ship) {
    const ship = clientObj.ship;
    if (Number.isFinite(data.ship.credits)) {
      ship.credits = data.ship.credits;
    }
    if (data.ship.cargo && typeof data.ship.cargo === "object") {
      ship.cargo = { ...data.ship.cargo };
    }
    if (Array.isArray(data.ship.outfits)) {
      ship.outfits = [...data.ship.outfits];
    }
    if (Number.isFinite(data.ship.weaponShieldPierce)) {
      ship.weaponShieldPierce = data.ship.weaponShieldPierce;
    }
    if (data.ship.hull && typeof data.ship.hull === "object") {
      for (const field of PLAYER_HULL_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(data.ship.hull, field)) {
          ship[field] = data.ship.hull[field];
        }
      }
      // Keep the SpaceEntity-level `mass` consistent with the restored
      // hull/outfit split so physics keeps matching the loadout.
      if (Number.isFinite(ship.hullMass) && Number.isFinite(ship.outfitMass)) {
        ship.mass = ship.hullMass + ship.outfitMass;
      }
    }
  }

  if (data.missions && clientObj.missionManager) {
    applyMissions(clientObj.missionManager, data.missions);
  }
}

/**
 * Pulls a JSON-safe snapshot of a `MissionManager`'s tracked progress.
 * Storyline state and the available-pool-per-planet are preserved so a
 * returning player sees the same offers they left behind.
 *
 * @param {Object} missionManager
 * @returns {Object}
 */
function serializeMissions(missionManager) {
  return {
    activeMissions: Array.isArray(missionManager.activeMissions)
      ? missionManager.activeMissions.map((m) => ({ ...m }))
      : [],
    availableMissions: cloneAvailableMissions(missionManager.availableMissions),
    storylineCompleted: !!missionManager.storylineCompleted,
  };
}

/**
 * Restores a {@link serializeMissions} snapshot onto a live `MissionManager`.
 * Callback fields (`onBountyAccepted`, `onStorylineStageAdvanced`) are
 * intentionally left alone so the server can re-attach them after restore.
 *
 * @param {Object} missionManager
 * @param {Object} data
 */
function applyMissions(missionManager, data) {
  if (Array.isArray(data.activeMissions)) {
    missionManager.activeMissions = data.activeMissions.map((m) => ({ ...m }));
  }
  if (data.availableMissions && typeof data.availableMissions === "object") {
    missionManager.availableMissions = cloneAvailableMissions(
      data.availableMissions,
    );
  }
  if (typeof data.storylineCompleted === "boolean") {
    missionManager.storylineCompleted = data.storylineCompleted;
  }
}

/**
 * Deep-clones the available-missions-by-planet map: each planet's mission
 * array is copied, and each mission within it is shallow-copied so the
 * snapshot can never share references with live state.
 *
 * @param {Object} map
 * @returns {Object}
 */
function cloneAvailableMissions(map) {
  if (!map || typeof map !== "object") return {};
  const out = {};
  for (const planetName of Object.keys(map)) {
    const list = map[planetName];
    if (Array.isArray(list)) {
      out[planetName] = list.map((m) => ({ ...m }));
    }
  }
  return out;
}

/**
 * Returns a fresh object with just the named fields copied from `source`.
 * Skips undefined values so restored ships don't get accidentally cleared.
 *
 * @param {Object} source
 * @param {ReadonlyArray<string>} fields
 * @returns {Object}
 */
function pickFields(source, fields) {
  const out = {};
  for (const field of fields) {
    const value = source[field];
    if (value !== undefined) out[field] = value;
  }
  return out;
}

/**
 * Sector events carry a `spawnedShipIds` array that may exist or not depending
 * on event type. Clone it defensively so saves and loads cannot share state.
 *
 * @param {Object} event
 * @returns {Object}
 */
function cloneSectorEvent(event) {
  const out = { ...event };
  if (Array.isArray(event.spawnedShipIds)) {
    out.spawnedShipIds = [...event.spawnedShipIds];
  }
  return out;
}
