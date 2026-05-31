/**
 * SquadManager — manages co-op player party squads (SPEC-059).
 * Keeps track of squad memberships, leaders, invitations, and culls empty squads.
 */

/**
 * Represents a co-op party squad formed by players in the game lobby.
 */
export class Squad {
  /**
   * @param {string} id - The unique squad ID.
   * @param {string} leaderId - The player client ID who is the leader.
   */
  constructor(id, leaderId) {
    this.id = id;
    this.leaderId = leaderId;
    /** @type {Set<string>} */
    this.memberIds = new Set();
    this.memberIds.add(leaderId);
  }
}

/**
 * Singleton state manager coordinating all multiplayer co-op party squads.
 */
export class SquadManager {
  constructor() {
    /** @type {Map<string, Squad>} */
    this.squads = new Map();
    /** @type {Map<string, string>} */
    this.playerToSquad = new Map(); // Map playerId -> squadId
  }

  /**
   * Creates a new squad with the specified leader.
   * @param {string} leaderId
   * @returns {Squad}
   */
  createSquad(leaderId) {
    // If player is already in a squad, leave it first
    this.leaveSquad(leaderId);

    const squadId = `squad-${leaderId}-${Math.random().toString(36).substring(2, 6)}`;
    const squad = new Squad(squadId, leaderId);
    this.squads.set(squadId, squad);
    this.playerToSquad.set(leaderId, squadId);
    return squad;
  }

  /**
   * Adds a player to a squad. Enforces a maximum size of 4.
   * @param {string} squadId
   * @param {string} playerId
   * @returns {{ success: boolean, reason: string }}
   */
  joinSquad(squadId, playerId) {
    this.leaveSquad(playerId);

    const squad = this.squads.get(squadId);
    if (!squad) {
      return { success: false, reason: "Squad does not exist!" };
    }

    if (squad.memberIds.size >= 4) {
      return { success: false, reason: "Squad is full (Max 4 players)!" };
    }

    squad.memberIds.add(playerId);
    this.playerToSquad.set(playerId, squadId);
    return { success: true, reason: "" };
  }

  /**
   * Removes a player from their current squad.
   * @param {string} playerId
   * @returns {void}
   */
  leaveSquad(playerId) {
    const squadId = this.playerToSquad.get(playerId);
    if (!squadId) return;

    const squad = this.squads.get(squadId);
    this.playerToSquad.delete(playerId);

    if (squad) {
      squad.memberIds.delete(playerId);

      // If the squad is empty, dissolve it
      if (squad.memberIds.size === 0) {
        this.squads.delete(squadId);
        return;
      }

      // If the leader leaves, assign a new leader
      if (squad.leaderId === playerId) {
        const nextLeader = Array.from(squad.memberIds)[0];
        squad.leaderId = nextLeader;
      }
    }
  }

  /**
   * Gets the squad ID for a player.
   * @param {string} playerId
   * @returns {string|null}
   */
  getSquadId(playerId) {
    return this.playerToSquad.get(playerId) || null;
  }

  /**
   * Gets the squad details for a player.
   * @param {string} playerId
   * @returns {Squad|null}
   */
  getSquadForPlayer(playerId) {
    const squadId = this.getSquadId(playerId);
    if (!squadId) return null;
    return this.squads.get(squadId) || null;
  }

  /**
   * Dissolves all squads (useful for test resets).
   */
  reset() {
    this.squads.clear();
    this.playerToSquad.clear();
  }
}

/**
 * Singleton instance of SquadManager coordinating all active player squads.
 * @type {SquadManager}
 */
export const squadManager = new SquadManager();
