import {
  generateMissionsFromWorld,
  applyMissionConsequences,
} from "./GenerativeMissions.js";

/** @typedef {import("./Planet.js").Planet} Planet */

/**
 * Manages the procedural mission generation, active contract tracking, and completion cycles.
 */
export class MissionManager {
  constructor() {
    this.activeMissions = [];
    this.availableMissions = {}; // Map of planetName -> Array of missions
    this.storylineCompleted = false;
    this.onStorylineStageAdvanced = null; // Callback to spawn boss ships
    this.onBountyAccepted = null; // Callback for spawning normal bounties
    this.onEscortAccepted = null; // Callback for spawning escort target companion ships

    // Static database of elite/named bounty targets
    this.bountyNames = [
      "Void Serpent",
      "Shadow Fang",
      "Karr the Merciless",
      "Eclipse Phantom",
      "Viper Monarch",
      "Gallows Reaper",
      "Nova Scourge",
      "Cinder Vanguard",
    ];

    // Static database of flavor texts for missions
    this.courierCommodities = [
      "food",
      "electronics",
      "minerals",
      "machinery",
      "luxuries",
    ];
  }

  /**
   * Generates 2-3 random missions for a specific planet if not already populated.
   * @param {string} planetName - Name of current planet.
   * @param {Array<Planet>} allPlanets - List of all planets in the sector.
   * @param {Object|null} [factionRegistry=null] - Faction standing registry.
   * @param {string|null} [playerId=null] - Player ID.
   */
  generateMissionsForPlanet(
    planetName,
    allPlanets,
    factionRegistry = null,
    playerId = null,
  ) {
    const missions = [];
    const count = 3; // 3 procedural missions per landing

    const destinationPlanets = allPlanets.filter((p) => p.name !== planetName);
    if (destinationPlanets.length === 0) return;

    for (let i = 0; i < count; i++) {
      let typeRand = Math.random();
      const isRoguesHollow = planetName === "Rogue's Hollow";
      if (isRoguesHollow && i < 2) {
        // Force high probability of smuggling at Rogue's Hollow (2 out of 3 generated contracts)
        typeRand = 0.4;
      }
      const destPlanet =
        destinationPlanets[
          Math.floor(Math.random() * destinationPlanets.length)
        ];

      if (typeRand < 0.3) {
        // 1. Courier Delivery Mission
        const commodity =
          this.courierCommodities[
            Math.floor(Math.random() * this.courierCommodities.length)
          ];
        const amount = 2 + Math.floor(Math.random() * 5); // 2 to 6 tons
        const distance = destPlanet.position.distance(
          allPlanets.find((p) => p.name === planetName).position,
        );
        const reward = Math.round(500 + distance * 0.4 + amount * 80);

        missions.push({
          id: `courier-${planetName}-${Date.now()}-${i}`,
          type: "courier",
          title: `Courier Delivery to ${destPlanet.name}`,
          description: `Transport ${amount} tons of ${commodity} to ${destPlanet.name}. Safe transit required.`,
          reward: reward,
          origin: planetName,
          destination: destPlanet.name,
          cargoItem: commodity,
          cargoAmount: amount,
          isAccepted: false,
          isCompleted: false,
        });
      } else if (typeRand < 0.55) {
        // 2. High-Risk Smuggling Mission / Underworld Contraband Smuggling
        const amount = 3 + Math.floor(Math.random() * 4); // 3 to 6 tons of contraband
        const distance = destPlanet.position.distance(
          allPlanets.find((p) => p.name === planetName).position,
        );

        let reward, title, description, consequences;
        const isUnderworld = isRoguesHollow;

        if (isUnderworld) {
          // Massive payout! 4.5x multiplier on a higher base rate
          reward = Math.round((1500 + distance * 0.8 + amount * 200) * 4.5);
          title = `Underworld Contraband Smuggling to ${destPlanet.name}`;
          description = `Underworld Smuggling: Transport ${amount} tons of highly valuable illicit contraband to ${destPlanet.name}. Earn Pirate respect (+15 standings) but anger the Federation (-12 standings) and Frontier League (-8 standings)!`;
          consequences = {
            factionDeltas: [
              { playerId, faction: "Pirates", delta: 15.0 },
              { playerId, faction: "Federation", delta: -12.0 },
              { playerId, faction: "Frontier League", delta: -8.0 },
            ],
          };
        } else {
          reward = Math.round((800 + distance * 0.5 + amount * 120) * 3);
          title = `Smuggle Contraband to ${destPlanet.name}`;
          description = `High-risk, high-payout cargo smuggling. Transport ${amount} tons of black-market contraband to ${destPlanet.name}. Avoid security scans on arrival!`;
          consequences = null;
        }

        missions.push({
          id: `${isUnderworld ? "underworld-" : ""}smuggle-${planetName}-${Date.now()}-${i}`,
          type: "smuggle",
          title: title,
          description: description,
          reward: reward,
          origin: planetName,
          destination: destPlanet.name,
          cargoItem: "contraband",
          cargoAmount: amount,
          isAccepted: false,
          isCompleted: false,
          generated: isUnderworld ? true : undefined,
          consequences: consequences,
        });
      } else if (typeRand < 0.8) {
        // 3. Combat Bounty Hunt
        const targetName =
          this.bountyNames[
            Math.floor(Math.random() * this.bountyNames.length)
          ] +
          " " +
          (10 + Math.floor(Math.random() * 89));
        const distance = destPlanet.position.distance(
          allPlanets.find((p) => p.name === planetName).position,
        );
        const reward = Math.round(3000 + distance * 0.8 + Math.random() * 1000);

        missions.push({
          id: `bounty-${planetName}-${Date.now()}-${i}`,
          type: "bounty",
          title: `Wanted: ${targetName}`,
          description: `Neutralize the infamous pirate boss ${targetName} reported terrorizing outer flight paths in orbit of ${destPlanet.name}.`,
          reward: reward,
          origin: planetName,
          destination: destPlanet.name,
          targetName: targetName,
          isAccepted: false,
          isCompleted: false,
        });
      } else {
        // 4. Passenger Charter
        const bunks = 1 + Math.floor(Math.random() * 3); // 1-3 berths
        const distance = destPlanet.position.distance(
          allPlanets.find((p) => p.name === planetName).position,
        );
        const reward = Math.round(600 + distance * 0.5 + bunks * 220);

        missions.push({
          id: `passenger-${planetName}-${Date.now()}-${i}`,
          type: "passenger",
          title: `Passenger Charter to ${destPlanet.name}`,
          description: `Ferry ${bunks} passenger(s) to ${destPlanet.name}. They pay on safe arrival.`,
          reward: reward,
          origin: planetName,
          destination: destPlanet.name,
          bunks: bunks,
          isAccepted: false,
          isCompleted: false,
        });
      }
    }

    const originPlanet = allPlanets.find((p) => p.name === planetName);
    const planetFaction = originPlanet ? originPlanet.faction : null;
    let standing = 0;
    if (factionRegistry && playerId && planetFaction) {
      standing = factionRegistry.getStanding(playerId, planetFaction);
    }

    if (planetFaction && planetFaction !== "Independents") {
      for (const m of missions) {
        if (m.reward > 2000) {
          if (standing < 30) {
            m.reward = 2000;
          } else {
            /** @type {any} */ (m).standingRequired = 30;
            /** @type {any} */ (m).faction = planetFaction;
          }
        }
      }
    }

    if (planetFaction && planetFaction !== "Independents" && standing > 60) {
      const destPlanet =
        destinationPlanets[
          Math.floor(Math.random() * destinationPlanets.length)
        ];
      missions.push({
        id: `escort-ambassador-${planetName}-${Date.now()}`,
        type: "escort_ambassador",
        title: `Elite Allied Escort: Ambassador to ${destPlanet.name}`,
        description: `Ambassadorial Escort: Escort the fragile high-value Diplomatic Transport safely to ${destPlanet.name}. Be prepared for pirate ambushers!`,
        reward: 8000,
        origin: planetName,
        destination: destPlanet.name,
        isAccepted: false,
        isCompleted: false,
        standingRequired: 60,
        faction: planetFaction,
      });
    }

    // Proactively generate campaign storyline quest if none active and not completed
    const hasActiveStory = this.activeMissions.some(
      (m) => m.type === "storyline",
    );
    if (!hasActiveStory && !this.storylineCompleted) {
      const storyMission = this.generateStorylineMission(
        planetName,
        allPlanets,
      );
      if (storyMission) {
        missions.push(storyMission);
      }
    }

    this.availableMissions[planetName] = missions;
  }

  /**
   * Generates a 3-stage storyline quest.
   */
  generateStorylineMission(planetName, allPlanets) {
    const titles = ["Void Cipher", "Ancient Relic", "Nebula Legacy"];
    const campaignName = titles[Math.floor(Math.random() * titles.length)];

    const destinationPlanets = allPlanets.filter((p) => p.name !== planetName);
    if (destinationPlanets.length < 2) return null;

    // Pick 2 distinct destination planets
    const dest1 =
      destinationPlanets[Math.floor(Math.random() * destinationPlanets.length)];
    const remaining = destinationPlanets.filter((p) => p.name !== dest1.name);
    const dest2 = remaining[Math.floor(Math.random() * remaining.length)];

    return {
      id: `storyline-${planetName}-${Date.now()}`,
      type: "storyline",
      campaignName: campaignName,
      title: `Story: ${campaignName} (Stage 1/3)`,
      description: `Stage 1: A mysterious encrypted signal was intercepted. Deliver the encrypted transmission archives (electronics) to our contact on ${dest1.name} to decipher them.`,
      reward: 15000,
      origin: planetName,
      destination: dest1.name,
      cargoItem: "electronics",
      cargoAmount: 1,
      isAccepted: false,
      isCompleted: false,
      stage: 1,
      planets: [planetName, dest1.name, dest2.name],
    };
  }

  /**
   * Accepts a mission, validating cargo limits and applying cargo payload.
   */
  acceptMission(planetName, missionId, player) {
    const list = this.availableMissions[planetName] || [];
    const mission = list.find((m) => m.id === missionId);

    if (!mission) {
      return { success: false, message: "Mission not found.", mission: null };
    }

    // Passenger charters occupy bunks rather than cargo tonnage.
    if (mission.type === "passenger") {
      const capacity = Number.isFinite(player.passengerCapacity)
        ? player.passengerCapacity
        : 0;
      const usedBunks = this.activeMissions
        .filter((m) => m.type === "passenger")
        .reduce((sum, m) => sum + (m.bunks || 0), 0);
      if (usedBunks + (mission.bunks || 0) > capacity) {
        return {
          success: false,
          message: `Not enough passenger berths! Needs ${mission.bunks} free berth(s).`,
          mission: null,
        };
      }
    }

    // 1. Cargo Space check
    if (mission.cargoAmount && mission.cargoItem) {
      if (
        player.getCargoWeight() + mission.cargoAmount >
        player.cargoCapacity
      ) {
        return {
          success: false,
          message: `Insufficient cargo capacity! Needs ${mission.cargoAmount} tons of free space.`,
          mission: null,
        };
      }

      // Add cargo immediately
      player.addCargo(mission.cargoItem, mission.cargoAmount);
    }

    // 2. Mark accepted
    mission.isAccepted = true;
    this.activeMissions.push(mission);

    // Remove from available
    this.availableMissions[planetName] = list.filter((m) => m.id !== missionId);

    // Fire normal bounty accept hooks
    if (mission.type === "bounty" && this.onBountyAccepted) {
      this.onBountyAccepted(mission);
    }

    if (mission.type === "escort_ambassador" && this.onEscortAccepted) {
      this.onEscortAccepted(mission);
    }

    return {
      success: true,
      message: `Accepted contract: ${mission.title}`,
      mission: mission,
    };
  }

  /**
   * Triggers courier/smuggling landing validation on arrival.
   * @param {string} destinationName - Name of landed planet.
   * @param {Object} player - Player ship.
   * @param {Object} [world={}] - World context for consequences.
   */
  checkArrivalCompletions(destinationName, player, world = {}) {
    const completed = [];
    const remaining = [];

    for (const mission of this.activeMissions) {
      if (
        (mission.type === "courier" ||
          mission.type === "smuggle" ||
          mission.type === "delivery" ||
          mission.type === "escort_ambassador") &&
        mission.destination === destinationName
      ) {
        // Complete the delivery
        mission.isCompleted = true;
        player.credits += mission.reward;

        // Remove cargo if present
        if (mission.cargoItem && mission.cargoAmount) {
          player.removeCargo(mission.cargoItem, mission.cargoAmount);
        }

        // Clean up escort transport entity from the world
        if (mission.type === "escort_ambassador" && world.engine) {
          const transport = world.engine.entities.find(
            (e) =>
              e.type === "ship" &&
              e.name === "Diplomatic Transport" &&
              !e._isDestroyed,
          );
          if (transport) {
            world.engine.removeEntity(transport.id);
            if (Array.isArray(world.ais)) {
              const aiIdx = world.ais.findIndex((a) => a.ship === transport);
              if (aiIdx !== -1) {
                world.ais.splice(aiIdx, 1);
              }
            }
          }
        }

        if (mission.generated) {
          if (
            mission.consequences &&
            Array.isArray(mission.consequences.factionDeltas)
          ) {
            for (const fd of mission.consequences.factionDeltas) {
              if (fd && !fd.playerId && player && player.id) {
                fd.playerId = player.id;
              }
            }
          }
          const consequences = applyMissionConsequences(mission, world);
          mission.factionChanges = consequences.factionChanges;
          mission.marketChanges = consequences.marketChanges;
        }

        completed.push(mission);
      } else if (
        mission.type === "passenger" &&
        mission.destination === destinationName
      ) {
        // Passengers disembark and pay on arrival; they carry no cargo, and
        // leaving activeMissions frees the bunks they occupied.
        mission.isCompleted = true;
        player.credits += mission.reward;

        if (mission.generated) {
          if (
            mission.consequences &&
            Array.isArray(mission.consequences.factionDeltas)
          ) {
            for (const fd of mission.consequences.factionDeltas) {
              if (fd && !fd.playerId && player && player.id) {
                fd.playerId = player.id;
              }
            }
          }
          const consequences = applyMissionConsequences(mission, world);
          mission.factionChanges = consequences.factionChanges;
          mission.marketChanges = consequences.marketChanges;
        }

        completed.push(mission);
      } else if (
        mission.type === "storyline" &&
        mission.destination === destinationName &&
        mission.stage === 1
      ) {
        // Advance to Stage 2!
        player.removeCargo(mission.cargoItem, mission.cargoAmount); // remove logs

        mission.stage = 2;
        mission.title = `Story: ${mission.campaignName} (Stage 2/3)`;
        mission.destination = mission.planets[2];
        mission.description = `Stage 2: The contact deciphered the archives! They point to a secret data vault at ${mission.destination}. Defeat the Rival Spy Agent intercepting us in orbit of ${mission.destination}!`;
        mission.targetName = `Rival Agent ${10 + Math.floor(Math.random() * 89)}`;
        mission.cargoItem = null;
        mission.cargoAmount = 0;

        remaining.push(mission);
        completed.push({
          ...mission,
          title: `${mission.campaignName} - Stage 1 Decoded!`,
        }); // trigger notification

        // Callback to spawn Stage 2 Boss
        if (this.onStorylineStageAdvanced) {
          this.onStorylineStageAdvanced(mission);
        }
      } else {
        remaining.push(mission);
      }
    }

    this.activeMissions = remaining;

    for (const mission of completed) {
      if (mission.faction && mission.reward > 2000) {
        if (!player.navalMerits) player.navalMerits = {};
        if (!player.navalRank) player.navalRank = {};

        const f = mission.faction;
        player.navalMerits[f] = (player.navalMerits[f] || 0) + 1;
        const merits = player.navalMerits[f];

        let newRank = player.navalRank[f] || "RECRUIT";
        const oldRank = newRank;

        if (merits >= 6) {
          newRank = "COMMANDER";
        } else if (merits >= 3) {
          newRank = "LIEUTENANT";
        } else if (merits >= 1) {
          newRank = "ENSIGN";
        }

        if (newRank !== oldRank) {
          player.navalRank[f] = newRank;
          mission.promotionMessage = `PROMOTION: You have been promoted to ${newRank} in the ${f} Naval Fleet!`;
        }
      }
    }

    return completed;
  }

  /**
   * Evaluates if a destroyed bounty matches active targets.
   * @param {string} shipName - Name of destroyed target.
   * @param {Object} player - Player ship.
   * @param {Object} [world={}] - World context for consequences.
   */
  checkBountyCompletion(shipName, player, world = {}) {
    const index = this.activeMissions.findIndex(
      (m) =>
        (m.type === "bounty" && m.targetName === shipName) ||
        (m.type === "hunt" && m.targetName === shipName) ||
        (m.type === "storyline" && m.targetName === shipName),
    );

    if (index !== -1) {
      const mission = this.activeMissions[index];

      if (mission.type === "storyline") {
        if (mission.stage === 2) {
          // Advance to Stage 3!
          mission.stage = 3;
          mission.title = `Story: ${mission.campaignName} (Stage 3/3)`;
          mission.destination = mission.planets[0]; // back to starting system for climax
          mission.description = `Stage 3: The Rival Agent's black box revealed the mastermind! Return to ${mission.destination} and destroy the massive Nebula Dreadnought dreadnought flagship!`;
          mission.targetName = `Nebula Dreadnought`;

          // Callback to spawn Stage 3 Final Boss!
          if (this.onStorylineStageAdvanced) {
            this.onStorylineStageAdvanced(mission);
          }
          return {
            ...mission,
            stageAdvanced: true,
            message: `Defeated Rival Agent! black box coordinates retrieved. Return to ${mission.destination} for the final showdown!`,
          };
        } else if (mission.stage === 3) {
          // Complete Storyline!
          mission.isCompleted = true;
          player.credits += mission.reward;

          // Reward a legendary outfit!
          player.outfits.push("Aegis Shield Matrix");
          player.maxShield += 800;
          player.shield = player.maxShield;

          this.storylineCompleted = true;
          this.activeMissions.splice(index, 1);
          return {
            ...mission,
            campaignCompleted: true,
            message: `CAMPAIGN COMPLETE: ${mission.campaignName} completed! Neutralized the Nebula Dreadnought! Received +15,000 CR and Aegis Shield Matrix upgrade!`,
          };
        }
      } else {
        // Standard Bounty Complete
        mission.isCompleted = true;
        player.credits += mission.reward;

        if (mission.generated) {
          const consequences = applyMissionConsequences(mission, world);
          mission.factionChanges = consequences.factionChanges;
          mission.marketChanges = consequences.marketChanges;
        }

        // Remove from active
        this.activeMissions.splice(index, 1);

        if (mission.faction && mission.reward > 2000) {
          if (!player.navalMerits) player.navalMerits = {};
          if (!player.navalRank) player.navalRank = {};

          const f = mission.faction;
          player.navalMerits[f] = (player.navalMerits[f] || 0) + 1;
          const merits = player.navalMerits[f];

          let newRank = player.navalRank[f] || "RECRUIT";
          const oldRank = newRank;

          if (merits >= 6) {
            newRank = "COMMANDER";
          } else if (merits >= 3) {
            newRank = "LIEUTENANT";
          } else if (merits >= 1) {
            newRank = "ENSIGN";
          }

          if (newRank !== oldRank) {
            player.navalRank[f] = newRank;
            mission.promotionMessage = `PROMOTION: You have been promoted to ${newRank} in the ${f} Naval Fleet!`;
          }
        }

        return mission;
      }
    }

    return null;
  }

  /**
   * Generates missions composed from the live world state (real shortages and
   * notable bounty targets) for `planetName`, appending them to the available
   * pool for that planet. Pure delegation to {@link generateMissionsFromWorld}
   * — see that module for the world snapshot shape and tuning knobs.
   *
   * @param {string} planetName - Planet whose available-mission list to append.
   * @param {Object} world - World snapshot (planets/baseMarkets/bountyTargets/etc.).
   * @param {Object} options - Generator options; `options.rng` is REQUIRED.
   * @returns {Array<Object>} The missions that were appended.
   */
  generateWorldMissions(planetName, world, options) {
    const generated = generateMissionsFromWorld(world, options);
    if (generated.length === 0) return generated;
    if (!this.availableMissions[planetName]) {
      this.availableMissions[planetName] = [];
    }
    this.availableMissions[planetName].push(...generated);
    return generated;
  }

  /**
   * Marks a generated mission complete: pays out the reward, unloads any
   * cargo it carried, applies the world-state consequences the mission was
   * promised at generation time, and removes it from the active list.
   *
   * @param {string} missionId - The generated mission's id.
   * @param {Object} player - Player ship (`credits`, `removeCargo`).
   * @param {Object} world - World snapshot (`planets`, `baseMarkets`, `factionRegistry`).
   * @returns {?{mission: Object, marketChanges: Array<Object>, factionChanges: Array<Object>}}
   *   Result of completion, or `null` if the id isn't an active generated mission.
   */
  completeGeneratedMission(missionId, player, world = {}) {
    const index = this.activeMissions.findIndex(
      (m) => m.id === missionId && m.generated === true,
    );
    if (index === -1) return null;
    const mission = this.activeMissions[index];

    if (
      mission.cargoItem &&
      mission.cargoAmount &&
      player &&
      typeof player.removeCargo === "function"
    ) {
      player.removeCargo(mission.cargoItem, mission.cargoAmount);
    }
    if (player && Number.isFinite(player.credits)) {
      player.credits += mission.reward || 0;
    }

    if (
      mission.consequences &&
      Array.isArray(mission.consequences.factionDeltas)
    ) {
      for (const fd of mission.consequences.factionDeltas) {
        if (fd && !fd.playerId && player && player.id) {
          fd.playerId = player.id;
        }
      }
    }
    const consequences = applyMissionConsequences(mission, world);

    mission.isCompleted = true;
    this.activeMissions.splice(index, 1);

    if (mission.faction && mission.reward > 2000 && player) {
      if (!player.navalMerits) player.navalMerits = {};
      if (!player.navalRank) player.navalRank = {};

      const f = mission.faction;
      player.navalMerits[f] = (player.navalMerits[f] || 0) + 1;
      const merits = player.navalMerits[f];

      let newRank = player.navalRank[f] || "RECRUIT";
      const oldRank = newRank;

      if (merits >= 6) {
        newRank = "COMMANDER";
      } else if (merits >= 3) {
        newRank = "LIEUTENANT";
      } else if (merits >= 1) {
        newRank = "ENSIGN";
      }

      if (newRank !== oldRank) {
        player.navalRank[f] = newRank;
        mission.promotionMessage = `PROMOTION: You have been promoted to ${newRank} in the ${f} Naval Fleet!`;
      }
    }

    return {
      mission,
      marketChanges: consequences.marketChanges,
      factionChanges: consequences.factionChanges,
    };
  }

  /**
   * Cancels/abandons an active contract.
   */
  abandonMission(missionId, player) {
    const index = this.activeMissions.findIndex((m) => m.id === missionId);
    if (index !== -1) {
      const mission = this.activeMissions[index];

      // Remove cargo if applicable
      if (mission.cargoAmount && mission.cargoItem) {
        player.removeCargo(mission.cargoItem, mission.cargoAmount);
      }

      this.activeMissions.splice(index, 1);
    }
  }
}
