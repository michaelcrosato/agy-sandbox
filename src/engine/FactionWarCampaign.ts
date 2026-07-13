/**
 * FactionWarCampaign.js — pure, headless strategy engine simulating dynamic faction conflicts.
 * Tracks military power ratios, active sector sieges, caravan blockades, and battle history logs.
 *
 * Designed to be 100% deterministic and unit-testable via seeded PRNG.
 */

/**
 * Builds a mulberry32 PRNG closed over a single 32-bit seed.
 * Yields a number in [0, 1) — drop-in for Math.random but deterministic.
 *
 * @param {number} [seed=1] - Integer seed.
 * @returns {() => number} Seeded RNG function.
 */
export function createSeededRng(seed = 1) {
  let state = seed >>> 0 || 1;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Human-readable display mapping for logical sector identifiers.
 * @type {Record<string, string>}
 */
export const SECTOR_NAMES = Object.freeze({
  core: "Sol Sector",
  frontier: "Vega Sector",
  rim: "Nebula Sector",
});

/**
 * Strategic headless engine managing galactic conflicts tick-by-tick.
 */
export class FactionWarCampaign {
  declare activeSieges;
  declare battleHistory;
  declare blockades;
  declare militaryPower;
  declare seed;
  declare ticks;
  /**
   * Creates a FactionWarCampaign engine.
   * @param {Object} [initialState] - Pre-loaded state for restoring after restart.
   */
  constructor(initialState = null) {
    /** @type {number} */
    this.ticks = 0;

    /** @type {number} */
    this.seed = 1337;

    /** @type {Record<string, Record<string, number>>} */
    this.militaryPower = {
      core: {
        Federation: 80,
        "Frontier League": 10,
        Pirates: 0,
        Independents: 10,
      },
      frontier: {
        Federation: 10,
        "Frontier League": 80,
        Pirates: 5,
        Independents: 5,
      },
      rim: {
        Federation: 5,
        "Frontier League": 5,
        Pirates: 40,
        Independents: 50,
      },
    };

    /** @type {Record<string, Object|null>} */
    this.activeSieges = {
      core: null,
      frontier: null,
      rim: null,
    };

    /** @type {Record<string, Object|null>} */
    this.blockades = {
      core: null,
      frontier: null,
      rim: null,
    };

    /** @type {Array<Object>} */
    this.battleHistory = [];

    if (initialState) {
      this.load(initialState);
    }
  }

  /**
   * Restores campaign state from saved state object.
   * @param {Object} state
   */
  load(state) {
    if (!state) return;
    if (state.ticks !== undefined) this.ticks = state.ticks;
    if (state.seed !== undefined) this.seed = state.seed;
    if (state.militaryPower) {
      this.militaryPower = JSON.parse(JSON.stringify(state.militaryPower));
    }
    if (state.activeSieges) {
      this.activeSieges = JSON.parse(JSON.stringify(state.activeSieges));
    }
    if (state.blockades) {
      this.blockades = JSON.parse(JSON.stringify(state.blockades));
    }
    if (state.battleHistory) {
      this.battleHistory = JSON.parse(JSON.stringify(state.battleHistory));
    }
  }

  /**
   * Serializes the current campaign state.
   * @returns {Object}
   */
  save() {
    return {
      ticks: this.ticks,
      seed: this.seed,
      militaryPower: JSON.parse(JSON.stringify(this.militaryPower)),
      activeSieges: JSON.parse(JSON.stringify(this.activeSieges)),
      blockades: JSON.parse(JSON.stringify(this.blockades)),
      battleHistory: JSON.parse(JSON.stringify(this.battleHistory)),
    };
  }

  /**
   * Advances the campaign simulation by one tick.
   * Simulates random skirmishes, updates military power ratios, triggers blockades/sieges,
   * adjusts territory control influence, and records chronicle events.
   *
   * @param {Object} [gameInstance] - The host game instance containing territoryControl and chronicle.
   */
  tick(gameInstance = null) {
    this.ticks++;
    const rng = createSeededRng(this.seed + this.ticks);

    // 1. Resolve existing sieges/blockades
    this._updateActiveCampaignStatus(gameInstance, rng);

    // 2. Skirmish trigger logic (e.g. 25% chance per tick)
    if (rng() < 0.25) {
      this._triggerSkirmish(gameInstance, rng);
    }

    // 3. Status trigger logic (e.g. 8% chance per tick for blockade or siege)
    if (rng() < 0.08) {
      this._triggerCampaignStatus(gameInstance, rng);
    }
  }

  /**
   * Updates duration and resolves active sieges/blockades.
   * @param {Object} gameInstance
   * @param {Function} rng
   * @private
   */
  _updateActiveCampaignStatus(gameInstance, rng) {
    const sectors = ["core", "frontier", "rim"];
    for (const sectorId of sectors) {
      // Update Siege
      if (this.activeSieges[sectorId]) {
        this.activeSieges[sectorId].duration--;
        if (this.activeSieges[sectorId].duration <= 0) {
          const siege = this.activeSieges[sectorId];
          this.activeSieges[sectorId] = null;
          this._resolveCampaignStatus(
            gameInstance,
            sectorId,
            "siege",
            siege,
            rng,
          );
        }
      }

      // Update Blockade
      if (this.blockades[sectorId]) {
        this.blockades[sectorId].duration--;
        if (this.blockades[sectorId].duration <= 0) {
          const blockade = this.blockades[sectorId];
          this.blockades[sectorId] = null;
          this._resolveCampaignStatus(
            gameInstance,
            sectorId,
            "blockade",
            blockade,
            rng,
          );
        }
      }
    }
  }

  /**
   * Resolves a completed siege or blockade.
   * @param {Object} gameInstance
   * @param {string} sectorId
   * @param {string} type - 'siege' or 'blockade'
   * @param {Object} statusData
   * @param {Function} rng
   * @private
   */
  _resolveCampaignStatus(gameInstance, sectorId, type, statusData, rng) {
    const sectorName = SECTOR_NAMES[sectorId] || sectorId;
    const faction = statusData.faction;

    // Determine controlling faction of sector
    const currentOwner =
      gameInstance && gameInstance.territoryControl
        ? gameInstance.territoryControl.sectors[sectorId].controllingFaction
        : this._getDominantFaction(sectorId);

    // Roll resolution outcome: 60% chance the local forces break the status, 40% the attacker scores a massive win
    const defenderWins = rng() < 0.6;
    const victor = defenderWins ? currentOwner : faction;
    const loser = defenderWins ? faction : currentOwner;

    const powerShift = Math.floor(rng() * 6) + 10; // 10-15 power shift

    // Adjust military power
    this.militaryPower[sectorId][victor] = Math.min(
      100,
      (this.militaryPower[sectorId][victor] || 0) + powerShift,
    );
    this.militaryPower[sectorId][loser] = Math.max(
      0,
      (this.militaryPower[sectorId][loser] || 0) - powerShift,
    );

    if (gameInstance && gameInstance.territoryControl) {
      gameInstance.territoryControl.adjustInfluence(
        sectorId,
        victor,
        powerShift,
      );
    }

    const title = `${type === "siege" ? "Siege" : "Blockade"} Resolved at ${sectorName}`;
    const description = defenderWins
      ? `The localized ${type} of ${sectorName} by ${faction} forces has been successfully repelled. Local ${currentOwner} patrols secured the sector, dealing a decisive blow.`
      : `The ${faction} forces successfully completed their tactical ${type} of ${sectorName}. Local ${currentOwner} forces were forced to retreat, leaving supply lanes compromised.`;

    // Chronicle event
    if (gameInstance && gameInstance.chronicle) {
      gameInstance.chronicle.recordEvent({
        sector: sectorId,
        category: "military",
        title: title,
        description: description,
        impactMetrics: {
          type,
          victor,
          loser,
          powerShift,
        },
      });
    }

    // Log history
    this.battleHistory.unshift({
      id: `${type}-resolve-${this.ticks}-${Math.floor(rng() * 10000)}`,
      tick: this.ticks,
      sector: sectorId,
      sectorName: sectorName,
      title: title,
      description: description,
      attacker: faction,
      defender: currentOwner,
      victor: victor,
      loser: loser,
      powerShift: powerShift,
      timestamp: Date.now(),
    });

    if (this.battleHistory.length > 50) {
      this.battleHistory.pop();
    }
  }

  /**
   * Triggers a dynamic skirmish between competing factions in a sector.
   * @param {Object} gameInstance
   * @param {Function} rng
   * @private
   */
  _triggerSkirmish(gameInstance, rng) {
    const sectors = ["core", "frontier", "rim"];
    const sectorId = sectors[Math.floor(rng() * sectors.length)];
    const sectorName = SECTOR_NAMES[sectorId];

    // Pick two factions with non-zero power in the sector, or just two arbitrary active factions
    const currentOwner =
      gameInstance && gameInstance.territoryControl
        ? gameInstance.territoryControl.sectors[sectorId].controllingFaction
        : this._getDominantFaction(sectorId);

    // Select all potential active rival factions
    const roster = ["Federation", "Frontier League", "Pirates", "Independents"];
    const rivals = roster.filter(
      (f) => f !== currentOwner && f !== "Independents",
    );
    if (rivals.length === 0) return;

    const attacker = rivals[Math.floor(rng() * rivals.length)];
    const defender = currentOwner;

    // Battle outcome calculation
    const attackerPower = this.militaryPower[sectorId][attacker] || 0;
    const defenderPower = this.militaryPower[sectorId][defender] || 0;
    const totalPower = attackerPower + defenderPower || 1;

    // Probability of attacker winning is attackerPower / totalPower, modified by rng
    const attackRoll = rng();
    const attackerWinProbability = attackerPower / totalPower;
    const attackerWins = attackRoll < attackerWinProbability;

    const victor = attackerWins ? attacker : defender;
    const loser = attackerWins ? defender : attacker;

    const powerShift = Math.floor(rng() * 5) + 4; // 4-8 power shift

    // Adjust military power
    this.militaryPower[sectorId][victor] = Math.min(
      100,
      (this.militaryPower[sectorId][victor] || 0) + powerShift,
    );
    this.militaryPower[sectorId][loser] = Math.max(
      0,
      (this.militaryPower[sectorId][loser] || 0) - powerShift,
    );

    if (gameInstance && gameInstance.territoryControl) {
      gameInstance.territoryControl.adjustInfluence(
        sectorId,
        victor,
        powerShift,
      );
    }

    const title = `Skirmish in ${sectorName}`;
    const description = `${attacker} fleets engaged ${defender} forces in the ${sectorName}. After a fierce exchange, ${victor} forces gained tactical supremacy.`;

    // Chronicle event
    if (gameInstance && gameInstance.chronicle) {
      gameInstance.chronicle.recordEvent({
        sector: sectorId,
        category: "military",
        title: title,
        description: description,
        impactMetrics: {
          attacker,
          defender,
          victor,
          loser,
          powerShift,
        },
      });
    }

    // Log history
    this.battleHistory.unshift({
      id: `skirmish-${this.ticks}-${Math.floor(rng() * 10000)}`,
      tick: this.ticks,
      sector: sectorId,
      sectorName: sectorName,
      title: title,
      description: description,
      attacker: attacker,
      defender: defender,
      victor: victor,
      loser: loser,
      powerShift: powerShift,
      timestamp: Date.now(),
    });

    if (this.battleHistory.length > 50) {
      this.battleHistory.pop();
    }
  }

  /**
   * Triggers a campaign siege or blockade status in a sector.
   * @param {Object} gameInstance
   * @param {Function} rng
   * @private
   */
  _triggerCampaignStatus(gameInstance, rng) {
    const sectors = ["core", "frontier", "rim"];
    const sectorId = sectors[Math.floor(rng() * sectors.length)];
    const sectorName = SECTOR_NAMES[sectorId];

    const currentOwner =
      gameInstance && gameInstance.territoryControl
        ? gameInstance.territoryControl.sectors[sectorId].controllingFaction
        : this._getDominantFaction(sectorId);

    // Roll for siege vs blockade (50/50)
    const isSiege = rng() < 0.5;

    if (isSiege) {
      if (this.activeSieges[sectorId]) return; // Already under siege
      // Pick a hostile faction.
      const besieger = currentOwner === "Pirates" ? "Federation" : "Pirates";
      const duration = Math.floor(rng() * 4) + 3; // 3-6 ticks

      this.activeSieges[sectorId] = {
        duration,
        faction: besieger,
      };

      const title = `${sectorName} Under Siege!`;
      const description = `Massive ${besieger} blockade fleets have laid siege to planetary hubs in ${sectorName}, disrupting regional supply networks.`;

      if (gameInstance && gameInstance.chronicle) {
        gameInstance.chronicle.recordEvent({
          sector: sectorId,
          category: "military",
          title: title,
          description: description,
          impactMetrics: {
            status: "siege",
            faction: besieger,
            duration,
          },
        });
      }
    } else {
      if (this.blockades[sectorId]) return; // Already blockaded
      const blocker =
        currentOwner === "Federation" ? "Frontier League" : "Federation";
      const duration = Math.floor(rng() * 4) + 3; // 3-6 ticks

      this.blockades[sectorId] = {
        duration,
        faction: blocker,
      };

      const title = `Trade Blockade in ${sectorName}`;
      const description = `${blocker} fleets have established a strict trade blockade around the jump lanes in ${sectorName}.`;

      if (gameInstance && gameInstance.chronicle) {
        gameInstance.chronicle.recordEvent({
          sector: sectorId,
          category: "military",
          title: title,
          description: description,
          impactMetrics: {
            status: "blockade",
            faction: blocker,
            duration,
          },
        });
      }
    }
  }

  /**
   * Gets the faction with the highest military power in the sector.
   * @param {string} sectorId
   * @returns {string} Faction name.
   * @private
   */
  _getDominantFaction(sectorId) {
    const power = this.militaryPower[sectorId];
    if (!power) return "Independents";
    let dominant = "Independents";
    let max = -1;
    for (const [faction, val] of Object.entries(power) as [string, any][]) {
      if (val > max) {
        max = val;
        dominant = faction;
      }
    }
    return dominant;
  }
}
