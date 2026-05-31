/**
 * TerritoryControl.js — pure, deterministic faction territory control and sector influence
 * tracking engine (SPEC-098).
 *
 * It manages influence maps per sector (core, frontier, rim), decays non-controlling
 * factions' influence over time, triggers control shifts when rival influence exceeds
 * the owner by 10 points, and maps the controlling faction to dynamic sector parameters.
 */
export class TerritoryControl {
  /**
   * Creates a TerritoryControl engine.
   * @param {Object} [initialState] - Pre-loaded state for restoring after restart.
   */
  constructor(initialState = null) {
    this.sectors = {
      core: {
        controllingFaction: "Federation",
        influence: {
          Federation: 80,
          "Frontier League": 10,
          Pirates: 0,
          Independents: 10,
        },
      },
      frontier: {
        controllingFaction: "Frontier League",
        influence: {
          Federation: 10,
          "Frontier League": 80,
          Pirates: 5,
          Independents: 5,
        },
      },
      rim: {
        controllingFaction: "Independents",
        influence: {
          Federation: 5,
          "Frontier League": 5,
          Pirates: 40,
          Independents: 50,
        },
      },
    };

    /** @type {Function|null} */
    this.onControlShift = null;

    if (initialState) {
      this.load(initialState);
    }
  }

  /**
   * Restores territory control state from save file data.
   * @param {Object} state
   */
  load(state) {
    if (state && state.sectors) {
      this.sectors = JSON.parse(JSON.stringify(state.sectors));
    }
  }

  /**
   * Serializes the current territory control state.
   * @returns {Object}
   */
  save() {
    return {
      sectors: JSON.parse(JSON.stringify(this.sectors)),
    };
  }

  /**
   * Adjusts influence of a specific faction in a sector.
   * Clamps score to [0, 100]. Triggers ownership evaluation.
   * @param {string} sectorId - 'core', 'frontier', or 'rim'.
   * @param {string} faction - Faction name.
   * @param {number} amount - Influence adjustment delta.
   * @returns {boolean} `true` if a control shift occurred.
   */
  adjustInfluence(sectorId, faction, amount) {
    const sector = this.sectors[sectorId];
    if (!sector) return false;

    if (sector.influence[faction] === undefined) {
      sector.influence[faction] = 0;
    }

    sector.influence[faction] = Math.max(
      0,
      Math.min(100, sector.influence[faction] + amount),
    );

    return this.checkControlShift(sectorId);
  }

  /**
   * Evaluates if ownership of a sector should shift.
   * Occurs when a rival's influence surpasses the current owner by a differential of >10.
   * @param {string} sectorId
   * @returns {boolean} `true` if control shifted.
   */
  checkControlShift(sectorId) {
    const sector = this.sectors[sectorId];
    if (!sector) return false;

    const currentOwner = sector.controllingFaction;
    const currentOwnerInfluence = sector.influence[currentOwner] || 0;

    let highestRivalFaction = null;
    let highestRivalInfluence = -1;

    for (const [faction, score] of Object.entries(sector.influence)) {
      if (faction === currentOwner) continue;
      if (score > highestRivalInfluence) {
        highestRivalInfluence = score;
        highestRivalFaction = faction;
      }
    }

    if (
      highestRivalFaction &&
      highestRivalInfluence > currentOwnerInfluence + 10
    ) {
      const oldOwner = sector.controllingFaction;
      sector.controllingFaction = highestRivalFaction;
      if (typeof this.onControlShift === "function") {
        this.onControlShift(sectorId, oldOwner, highestRivalFaction);
      }
      return true;
    }
    return false;
  }

  /**
   * Decays influence of non-controlling factions over time,
   * while slowly stabilizing the owner's influence back toward 100.
   * @param {number} dt - Time delta in seconds.
   */
  decayInfluence(dt) {
    const decayAmount = 0.2 * dt; // 0.2 points per second base decay rate

    for (const [sectorId, sector] of Object.entries(this.sectors)) {
      const owner = sector.controllingFaction;

      for (const faction of Object.keys(sector.influence)) {
        if (faction === owner) {
          sector.influence[faction] = Math.min(
            100,
            sector.influence[faction] + decayAmount * 0.5,
          );
        } else {
          sector.influence[faction] = Math.max(
            0,
            sector.influence[faction] - decayAmount,
          );
        }
      }

      this.checkControlShift(sectorId);
    }
  }

  /**
   * Maps current controlling faction of a sector to dynamic parameters.
   * @param {string} sectorId
   * @returns {{ security: string, taxRate: number, policeSpawnFactor: number }}
   */
  getSectorParameters(sectorId) {
    const sector = this.sectors[sectorId];
    if (!sector) {
      return {
        security: "medium",
        taxRate: 0.08,
        policeSpawnFactor: 1.0,
      };
    }

    const faction = sector.controllingFaction;
    switch (faction) {
      case "Federation":
        return {
          security: "high",
          taxRate: 0.12,
          policeSpawnFactor: 1.5,
        };
      case "Frontier League":
        return {
          security: "medium",
          taxRate: 0.08,
          policeSpawnFactor: 1.0,
        };
      case "Pirates":
        return {
          security: "lawless",
          taxRate: 0.2,
          policeSpawnFactor: 0.0,
        };
      case "Independents":
      default:
        return {
          security: "low",
          taxRate: 0.05,
          policeSpawnFactor: 0.5,
        };
    }
  }
}
