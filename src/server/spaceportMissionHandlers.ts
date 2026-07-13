import {
  createSeededRng,
  DEFAULT_GENERATIVE_OPTIONS,
} from "../engine/GenerativeMissions.js";

/**
 * Handles accepting a dynamic generative mission.
 * @param {Object} clientObj - The socket client connection object representing the active player.
 * @param {string} planetName - Governing planet where the mission resides.
 * @param {string} missionId - The unique ID of the mission.
 * @param {Object} targetPlanet - The planet entity.
 * @param {Object} room - The dynamic GameInstance room.
 * @returns {void}
 */
export function handleMissionAccept(
  clientObj,
  planetName,
  missionId,
  targetPlanet,
  room,
) {
  if (
    !clientObj ||
    !clientObj.ship ||
    !clientObj.isLanded ||
    !targetPlanet ||
    !room
  ) {
    return;
  }

  try {
    if (!clientObj.missionManager.availableMissions[planetName]) {
      let generated = [];
      if (
        typeof clientObj.missionManager.generateWorldMissions === "function"
      ) {
        const bountyTargets =
          room && room.ships && typeof room.ships.values === "function"
            ? (Array.from(room.ships.values()) as any[])
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

        const planetFactions = {};
        if (room.planets) {
          for (const p of room.planets) {
            planetFactions[p.name] = p.faction || "Independents";
          }
        }

        const world = {
          planets: room.planets,
          baseMarkets: room.baseMarkets || {},
          bountyTargets: bountyTargets,
          factionRegistry: room.factionRegistry,
          playerId: clientObj.id,
          planetFactions: planetFactions,
        };

        const options = {
          rng: createSeededRng(Math.floor(Date.now() + Math.random() * 100000)),
          ...DEFAULT_GENERATIVE_OPTIONS,
        };

        generated = clientObj.missionManager.generateWorldMissions(
          planetName,
          world,
          options,
        );
      }

      if (
        generated.length === 0 &&
        typeof clientObj.missionManager.generateMissionsForPlanet === "function"
      ) {
        clientObj.missionManager.generateMissionsForPlanet(
          planetName,
          room.planets,
          room.factionRegistry,
          clientObj.id,
        );
      }
    }

    const res = clientObj.missionManager.acceptMission(
      planetName,
      missionId,
      clientObj.ship,
    );
    if (res.success) {
      clientObj.send({
        type: "notification",
        message: res.message,
        style: "success",
      });
      clientObj.sendStats();
    } else {
      clientObj.send({
        type: "notification",
        message: res.message,
        style: "error",
      });
    }
  } catch (err) {
    console.error("Failed to accept dynamic mission:", err);
  }
}

/**
 * Handles abandoning an active mission.
 * @param {Object} clientObj - The socket client connection object representing the active player.
 * @param {string} missionId - The unique ID of the active mission.
 * @returns {void}
 */
export function handleMissionAbandon(clientObj, missionId) {
  if (!clientObj || !clientObj.ship) {
    return;
  }

  try {
    const activeM = clientObj.missionManager.activeMissions.find(
      (m) => m.id === missionId,
    );
    if (activeM) {
      clientObj.missionManager.abandonMission(missionId, clientObj.ship);
      clientObj.send({
        type: "notification",
        message: `Abandoned contract: ${activeM.title}`,
        style: "info",
      });
      clientObj.sendStats();
    }
  } catch (err) {
    console.error("Failed to abandon mission:", err);
  }
}
