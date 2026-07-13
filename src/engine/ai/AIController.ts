import { buildPerception, defaultIsThreat } from "./buildPerception.js";
import { selectGoal, Goals } from "./UtilityAI.js";
import { Vector2D } from "../../physics/Vector2D.js";

/**
 * @typedef {import("../Ship.js").Ship} Ship
 * @typedef {import("../SpaceEntity.js").SpaceEntity} SpaceEntity
 */

/**
 * AIController manages NPC behavior states (wander, chase, patrol, trade) and maps them into ship controls.
 */
export class AIController {
  declare caravanCargo;
  declare caravanState;
  declare conflictFactionA;
  declare conflictFactionB;
  declare consumerPlanetName;
  declare currentGoal;
  declare destination;
  declare escortMode;
  declare factionPolicy;
  declare factionRegistry;
  declare flagship;
  declare formation;
  declare isConflictZone;
  declare isRefuelTanker;
  declare isSmuggler;
  declare orbitAngle;
  declare perceptionOptions;
  declare producerPlanetName;
  declare refuelTargetId;
  declare role;
  declare route;
  declare ship;
  declare standingPolicy;
  declare target;
  declare targetPlanetName;
  declare useUtilityAdvisor;
  declare wanderAngle;
  declare wanderTimer;
  /**
   * Creates an AIController for a ship.
   * @param {Ship} ship - The ship being controlled.
   * @param {string} [role] - AI role ("pirate", "merchant", "guard").
   * @param {Object} [options] - Optional configuration:
   *   `factionPolicy` (pairwise relation view `isHostile`/`isAllied` — when set
   *   and both ships carry a `faction`, target selection uses faction relations,
   *   else the legacy `isPirateShip` classifier); `standingPolicy` (per-player
   *   disposition view so a guard targets a player hostile to its faction);
   *   `useUtilityAdvisor` (default off — when on a `UtilityAI` goal can override
   *   the role FSM, currently FLEE pre-empts with an evade); and
   *   `perceptionOptions` (overrides for `buildPerception`).
   */
  constructor(
    ship,
    role = "merchant",
    {
      factionPolicy = null,
      standingPolicy = null,
      factionRegistry = null,
      useUtilityAdvisor = false,
      perceptionOptions = null,
      isSmuggler = false,
    } = {},
  ) {
    this.ship = ship;
    this.role = role;
    this.factionPolicy = factionPolicy;
    // Per-player standing view (spec 016) — lets a guard target a player whose
    // standing with the guard's faction is hostile. Null ⇒ legacy targeting.
    this.standingPolicy = standingPolicy;
    this.factionRegistry = factionRegistry;
    this.useUtilityAdvisor = useUtilityAdvisor || isSmuggler;
    this.perceptionOptions = perceptionOptions;
    this.isSmuggler = isSmuggler;
    this.ship.isSmuggler = isSmuggler;

    // Advisory goal selected on the last update (null until first tick / when
    // the advisor is disabled). Exposed for observability and tests.
    this.currentGoal = null;

    // AI target tracking
    this.target = null;
    this.destination = null;

    // AI state counters
    this.wanderTimer = 0;
    this.wanderAngle = 0;

    // Escort AI parameters
    this.flagship = null;
    this.escortMode = "follow"; // "follow" (defend), "hold" (stay), "attack" (target lock)
    /** @type {string} */
    this.formation = "orbit"; // "orbit" (defensive orbit), "delta" (Delta wing)

    // Faction conflict zone states
    this.isConflictZone = false;
    this.conflictFactionA = null;
    this.conflictFactionB = null;

    // Caravan AI states
    this.caravanState = null;
    this.caravanCargo = null;
    this.producerPlanetName = null;
    this.consumerPlanetName = null;
    this.targetPlanetName = null;
    this.route = [];

    // Refuel tanker AI states (distress beacon, spec 084)
    /** @type {boolean} */
    this.isRefuelTanker = false;
    /** @type {string|null} */
    this.refuelTargetId = null;
  }

  /**
   * Evaluates sensors and updates ship control flags.
   * @param {number} dt - Time delta in seconds.
   * @param {Array<SpaceEntity>} entities - All active entities in the space simulation.
   */
  update(dt, entities) {
    if (this.ship.isDestroyed || this.ship.isDisabled) return;

    // Update coordinated shielding need (SPEC-156)
    if (this.ship.isVengeanceHunter) {
      const shieldRatio =
        this.ship.maxShield > 0 ? this.ship.shield / this.ship.maxShield : 1;
      this.ship.needsShieldCoordination = shieldRatio <= 0.4;
    }

    this.ship.clearControls();

    // 1. Scan for targets if necessary
    this.scanSensors(entities);

    // Update interdictor projection state on NPC warships
    if (this.ship.target && !this.ship.target.isDestroyed) {
      if (
        this.role === "guard" ||
        this.role === "pirate" ||
        this.role === "escort"
      ) {
        this.ship.isInterdicting = true;
      } else {
        this.ship.isInterdicting = false;
      }
    } else {
      this.ship.isInterdicting = false;
    }

    // 1b. Advisory goal layer (spec 017): when enabled, a UtilityAI goal can
    // pre-empt the role FSM. Only FLEE overrides today — a pressured agent
    // breaks off and evades regardless of role, which is the cross-role plan
    // change the role FSMs can't express (a merchant has no combat state at
    // all). Every other goal falls through to the legacy role behaviour, which
    // already maps ENGAGE→attack / TRADE→route / PATROL→wander.
    if (this.useUtilityAdvisor) {
      const perception = buildPerception(this.ship, entities, {
        factionPolicy: this.factionPolicy,
        standingPolicy: this.standingPolicy,
        factionRegistry: this.factionRegistry,
        isConflictZone: this.isConflictZone,
        conflictFactionA: this.conflictFactionA,
        conflictFactionB: this.conflictFactionB,
        ...this.perceptionOptions,
      });
      this.currentGoal = selectGoal(perception).goal;
      if (this.currentGoal === Goals.ESCAPE_SECURITY) {
        this.executeEscapeSecurity(entities);
        return;
      } else {
        this.ship.isChaffActive = false;
        this.ship.decoyJammerActive = false;
      }

      if (this.currentGoal === Goals.FLEE) {
        // Vengeance Hunters are highly disciplined and aggressive, so they only flee under extreme emergency (SPEC-156)
        const isVengeance =
          this.ship.isVengeanceHunter ||
          (this.ship.name &&
            (this.ship.name.includes("Vengeance") ||
              this.ship.name.includes("Hunter")));
        if (isVengeance && this.ship.armor / this.ship.maxArmor > 0.15) {
          this.executeEngage(entities, dt);
          return;
        }
        this.executeFlee(entities);
        return;
      } else if (this.currentGoal === Goals.REGROUP) {
        this.executeRegroup(entities);
        return;
      } else if (this.currentGoal === Goals.TRADE) {
        if (this.role === "caravan" || this.isSmuggler) {
          // Fall through to executeCaravanAI
        } else {
          this.executeTrade(entities);
          return;
        }
      } else if (this.currentGoal === Goals.ENGAGE) {
        this.executeEngage(entities, dt);
        return;
      }
    }

    // 2. Perform state machine navigation
    if (this.role === "pirate") {
      this.executePirateAI(dt);
    } else if (this.role === "guard") {
      this.executeGuardAI(dt, entities);
    } else if (this.role === "escort") {
      this.executeEscortAI(dt, entities);
    } else if (this.role === "caravan" || this.isSmuggler) {
      this.executeCaravanAI(dt, entities);
    } else {
      this.executeMerchantAI(dt);
    }
  }

  /**
   * Null-safe hostile-pirate classifier. Prefers an explicit `role`/`faction`
   * tag so a procedurally-named pirate is still recognised and a friendly ship
   * that happens to be named "...Raider..." is not. Falls back to the legacy
   * name heuristic only for entities with no role tag (keeps older call sites and
   * hand-built test fixtures working). Entities without a name string are never
   * hostile, which prevents a tick-wide crash from `.includes` on an undefined name.
   * @param {SpaceEntity} ent - Entity to classify.
   * @returns {boolean} True if the entity is a pirate-class threat.
   */
  static isPirateShip(ent) {
    if (!ent) return false;
    if (ent.role === "pirate") return true;
    // A ship with an explicit non-pirate role is decoupled from its name.
    // (Faction *disposition* is the factionPolicy's job, not this classifier.)
    if (typeof ent.role === "string" && ent.role.length > 0) return false;
    const n = ent.name;
    if (typeof n !== "string") return false;
    return n.includes("Pirate") || n.includes("Raider");
  }

  /**
   * Decides whether `ent` is a valid target for this controller's role.
   *
   * Faction-aware path (used only when this ship, the candidate, AND the
   * controller's factionPolicy are all present):
   *   - guard: engages factions hostile to its own.
   *   - pirate: engages anything not allied with and not of its own faction.
   *
   * Fallback (no factions configured or policy unset): preserves the legacy
   * name-based behaviour exactly, so existing fleets and tests are
   * unaffected.
   *
   * @param {SpaceEntity} ent - Candidate target.
   * @returns {boolean} True if the role wants to engage this entity.
   */
  shouldTarget(ent) {
    const selfFaction = this.ship.faction;
    const targetFaction = ent.faction;
    const factionPathAvailable =
      this.factionPolicy && selfFaction && targetFaction;

    if (this.role === "pirate") {
      if (factionPathAvailable) {
        if (selfFaction === targetFaction) return false;
        if (this.factionPolicy.isAllied(selfFaction, targetFaction))
          return false;
        return true;
      }
      return !AIController.isPirateShip(ent);
    }

    if (this.role === "guard") {
      // Standing-aware: a player whose standing with our faction is hostile is
      // a valid target even though players carry no faction tag (this keys on
      // per-player standings, not faction relations). NPCs aren't in the
      // standings map, so this is a no-op for them.
      if (
        this.standingPolicy &&
        selfFaction &&
        ent.id != null &&
        this.standingPolicy.isHostile(ent.id, selfFaction)
      ) {
        return true;
      }
      if (factionPathAvailable) {
        return this.factionPolicy.isHostile(selfFaction, targetFaction);
      }
      return AIController.isPirateShip(ent);
    }

    return false;
  }

  scanSensors(entities) {
    const isVengeance =
      this.ship.isVengeanceHunter ||
      (this.ship.name &&
        (this.ship.name.includes("Vengeance") ||
          this.ship.name.includes("Hunter Elite")));
    const sensorRange = isVengeance ? 1200 : 500;

    // Direct hunter wings to actively lock onto hostile players and maintain lock-on (SPEC-156)
    if (isVengeance && this.target && !this.target.isDestroyed) {
      const d = this.ship.position.distance(this.target.position);
      if (d < sensorRange) {
        // Keep target locked!
        return;
      }
    }

    let closestTarget = null;
    let closestDist = sensorRange;
    let bestScore = -1;

    for (const ent of entities) {
      if (
        !ent ||
        ent.id === this.ship.id ||
        ent.isDestroyed ||
        ent.type !== "ship"
      ) {
        continue;
      }

      const dist = this.ship.position.distance(ent.position);
      if (dist < sensorRange && this.shouldTarget(ent)) {
        if (this.useUtilityAdvisor) {
          // Prefer highest-weakness prey (lowest remaining shield/armor, highest thermal buildup)
          const shieldMax = ent.maxShield || 100;
          const shieldCur = ent.shield !== undefined ? ent.shield : shieldMax;
          const shieldWeakness = 1 - shieldCur / shieldMax;

          const armorMax = ent.maxArmor || 100;
          const armorCur = ent.armor !== undefined ? ent.armor : armorMax;
          const armorWeakness = 1 - armorCur / armorMax;

          const heatMax = ent.maxHeat || 100;
          const heatCur = ent.heat !== undefined ? ent.heat : 0;
          const heatWeakness = heatMax > 0 ? heatCur / heatMax : 0;

          const weakness = (shieldWeakness + armorWeakness + heatWeakness) / 3;
          const score = weakness * 1000 + (sensorRange - dist);
          if (score > bestScore) {
            bestScore = score;
            closestTarget = ent;
          }
        } else {
          if (dist < closestDist) {
            closestTarget = ent;
            closestDist = dist;
          }
        }
      }
    }

    this.target = closestTarget;
    this.ship.target = closestTarget;
  }

  /**
   * Combat AI pursuing and firing at target.
   * @param {number} dt - Time step.
   */
  executePirateAI(dt) {
    if (this.target) {
      // Chase target
      this.steerTowards(this.target.position);

      const dist = this.ship.position.distance(this.target.position);
      if (dist < 400) {
        this.ship.controls.isThrusting = dist > 150; // don't crash into them

        // Fire if reasonably aligned
        const angleToTarget = Math.atan2(
          this.target.position.y - this.ship.position.y,
          this.target.position.x - this.ship.position.x,
        );
        const headingDiff = Math.abs(
          this.normalizeAngle(angleToTarget - this.ship.heading),
        );

        if (headingDiff < 0.25) {
          this.ship.controls.isFiring = true;
        }
      } else {
        this.ship.controls.isThrusting = true;
      }
    } else {
      // Patrol wander
      this.executeWander(dt);
    }
  }

  /**
   * Defense AI guarding local planets and engaging pirates.
   * @param {number} dt - Time step.
   */
  executeGuardAI(dt, entities = []) {
    // 1. Vengeance Hunter special behaviors (SPEC-156)
    const isVengeance =
      this.ship.isVengeanceHunter ||
      (this.ship.name &&
        (this.ship.name.includes("Vengeance") ||
          this.ship.name.includes("Hunter Elite")));
    if (isVengeance && this.target && !this.target.isDestroyed) {
      // Manage interdiction sweep state based on proximity
      const distToTarget = this.ship.position.distance(this.target.position);
      if (distToTarget <= 400) {
        this.ship.isInterdicting = true;
      } else {
        this.ship.isInterdicting = false;
      }

      // Check if we are healthy and can coordinate shielding for a damaged wingman
      const myShieldRatio =
        this.ship.maxShield > 0 ? this.ship.shield / this.ship.maxShield : 1;
      const isHealthy = myShieldRatio > 0.4;

      if (isHealthy) {
        // Search for a damaged ally who needs shield coordination
        let damagedAlly = null;
        let closestAllyDist = 600;

        for (const ent of entities) {
          if (
            ent &&
            ent.type === "ship" &&
            ent !== this.ship &&
            ent.isVengeanceHunter &&
            ent.faction === this.ship.faction &&
            ent.needsShieldCoordination &&
            !ent.isDestroyed
          ) {
            const d = this.ship.position.distance(ent.position);
            if (d < closestAllyDist) {
              closestAllyDist = d;
              damagedAlly = ent;
            }
          }
        }

        if (damagedAlly) {
          // Coordinated Shielding: Intercept the line between the damaged ally and the threat (target)
          const toThreat = this.target.position
            .subtract(damagedAlly.position)
            .normalize();
          const defensivePos = damagedAlly.position.add(toThreat.multiply(90));

          this.steerTowards(defensivePos);
          this.ship.controls.isThrusting =
            this.ship.position.distance(defensivePos) > 30;

          // Turn to face the threat and attack while holding the line
          const angleToTarget = Math.atan2(
            this.target.position.y - this.ship.position.y,
            this.target.position.x - this.ship.position.x,
          );
          const headingDiff = Math.abs(
            this.normalizeAngle(angleToTarget - this.ship.heading),
          );
          if (headingDiff < 0.3) {
            this.ship.controls.isFiring = true;
          }
          return; // Done coordinating shielding!
        }
      }

      // Default Vengeance Attack Run (aggressive chase)
      this.steerTowards(this.target.position);
      if (distToTarget < 350) {
        this.ship.controls.isThrusting = distToTarget > 100;
        const angleToTarget = Math.atan2(
          this.target.position.y - this.ship.position.y,
          this.target.position.x - this.ship.position.x,
        );
        const headingDiff = Math.abs(
          this.normalizeAngle(angleToTarget - this.ship.heading),
        );
        if (headingDiff < 0.3) {
          this.ship.controls.isFiring = true;
        }
      } else {
        this.ship.controls.isThrusting = true;
      }
      return;
    }

    // 2. Default Guard AI
    if (this.target) {
      this.steerTowards(this.target.position);
      const dist = this.ship.position.distance(this.target.position);
      if (dist < 350) {
        this.ship.controls.isThrusting = dist > 100;
        const angleToTarget = Math.atan2(
          this.target.position.y - this.ship.position.y,
          this.target.position.x - this.ship.position.x,
        );
        const headingDiff = Math.abs(
          this.normalizeAngle(angleToTarget - this.ship.heading),
        );
        if (headingDiff < 0.3) {
          this.ship.controls.isFiring = true;
        }
      } else {
        this.ship.controls.isThrusting = true;
      }
    } else {
      this.executeWander(dt);
    }
  }

  /**
   * Merchant AI navigating from planet to planet to trade.
   * @param {number} dt - Time step.
   */
  executeMerchantAI(dt) {
    if (this.destination) {
      this.steerTowards(this.destination);

      const dist = this.ship.position.distance(this.destination);
      if (dist < 80) {
        // Slow down near arrival
        this.ship.controls.isThrusting = false;
        this.ship.controls.isBraking = true;

        if (this.ship.velocity.magnitude() < 5) {
          // Arrived! Cycle to next destination planet on next scan
          this.destination = null;
        }
      } else {
        this.ship.controls.isThrusting = true;
      }
    } else {
      this.executeWander(dt);
    }
  }

  /**
   * Helper to steer the ship towards a target position vector.
   * @param {{x: number, y: number}} targetPos - Coordinate to navigate toward.
   */
  steerTowards(targetPos) {
    const desiredAngle = Math.atan2(
      targetPos.y - this.ship.position.y,
      targetPos.x - this.ship.position.x,
    );

    const diff = this.normalizeAngle(desiredAngle - this.ship.heading);

    // If angular mismatch is large, steer left/right
    if (Math.abs(diff) > 0.05) {
      if (diff > 0) {
        this.ship.controls.isTurningRight = true;
      } else {
        this.ship.controls.isTurningLeft = true;
      }
    }
  }

  /**
   * NPC wandering mechanic when idle.
   * @param {number} dt - Time step.
   */
  executeWander(dt) {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      // Pick a random heading and duration
      this.wanderAngle = this.ship.heading + (Math.random() - 0.5) * Math.PI;
      this.wanderTimer = 3 + Math.random() * 4; // 3 to 7 seconds
    }

    const diff = this.normalizeAngle(this.wanderAngle - this.ship.heading);
    if (Math.abs(diff) > 0.1) {
      if (diff > 0) {
        this.ship.controls.isTurningRight = true;
      } else {
        this.ship.controls.isTurningLeft = true;
      }
    } else {
      // Gently cruise forward
      this.ship.controls.isThrusting = Math.random() > 0.3;
    }
  }

  /**
   * Evasion maneuver for the advisory FLEE goal: steer directly away from the
   * nearest threatening ship and burn. Uses the same hostility predicate that
   * drove the FLEE decision (the perception override if set, else the default),
   * so the ship flees what the scorer feared. If no threat can be located
   * (edge case), it coasts rather than thrusting blindly.
   * @param {Array<Object>} entities - All entities.
   */
  executeFlee(entities) {
    const isThreat =
      (this.perceptionOptions && this.perceptionOptions.isThreat) ||
      defaultIsThreat;

    let nearest = null;
    let best = Infinity;
    for (const ent of entities) {
      if (!ent || ent === this.ship || ent.type !== "ship" || ent.isDestroyed) {
        continue;
      }
      if (!isThreat(ent, this.ship)) continue;
      const d = this.ship.position.distance(ent.position);
      if (d < best) {
        best = d;
        nearest = ent;
      }
    }

    if (!nearest) return; // nothing to flee from; coast

    // Aim at a point directly opposite the threat and accelerate away.
    const fleeTarget = new Vector2D(
      this.ship.position.x + (this.ship.position.x - nearest.position.x),
      this.ship.position.y + (this.ship.position.y - nearest.position.y),
    );
    this.steerTowards(fleeTarget);
    this.ship.controls.isThrusting = true;
  }

  /**
   * Smuggler escape security FSM state. Maximizes thrusters towards nearest stargate,
   * deactivating weapons and deploying decoy jammers/chaff.
   * @param {Array<any>} entities - All sector entities.
   */
  executeEscapeSecurity(entities) {
    this.ship.controls.isFiring = false;
    this.ship.isChaffActive = true;
    this.ship.decoyJammerActive = true;

    let nearestGate = null;
    let bestDist = Infinity;
    for (const ent of entities) {
      if (ent && ent.type === "warp_gate") {
        const dist = this.ship.position.distance(ent.position);
        if (dist < bestDist) {
          bestDist = dist;
          nearestGate = ent;
        }
      }
    }

    if (nearestGate) {
      this.destination = nearestGate.position;
      this.steerTowards(this.destination);
      this.ship.controls.isThrusting = true;

      if (bestDist < 150) {
        // Warp jump out of the sector
        this.ship.position = nearestGate.targetPosition.clone();
        this.ship.velocity = new Vector2D(0, 0);
        this.destination = null;
        this.ship.isChaffActive = false;
        this.ship.decoyJammerActive = false;
      }
    } else {
      this.executeFlee(entities);
    }
  }

  /**
   * Defensive Escort autopilot executing defend formation or target interception commands.
   * @param {number} dt - Frame time step.
   * @param {Array<Object>} entities - All entities.
   */
  executeEscortAI(dt, entities) {
    if (!this.flagship || this.flagship.isDestroyed) {
      this.executeWander(dt);
      return;
    }

    // 1. Hold Command - stop in place
    if (this.escortMode === "hold") {
      const speed = this.ship.velocity.magnitude();
      if (speed > 5) {
        this.ship.controls.isBraking = true;
      }
      return;
    }

    // Focus Intercept Command - break off and intercept flagship's locked target
    if (this.escortMode === "intercept") {
      const currentTarget = this.flagship.target;

      if (currentTarget && !currentTarget.isDestroyed) {
        this.target = currentTarget;
        this.ship.target = currentTarget;
        this.steerTowards(currentTarget.position);
        const dist = this.ship.position.distance(currentTarget.position);
        if (dist < 500) {
          this.ship.controls.isThrusting = dist > 120;
          const angle = Math.atan2(
            currentTarget.position.y - this.ship.position.y,
            currentTarget.position.x - this.ship.position.x,
          );
          const headingDiff = Math.abs(
            this.normalizeAngle(angle - this.ship.heading),
          );
          if (headingDiff < 0.25) {
            this.ship.controls.isFiring = true;
          }
        } else {
          this.ship.controls.isThrusting = true;
        }
      } else {
        this.escortMode = "follow";
      }
      return;
    }

    // 2. Focus Attack Command - find and intercept hostile target
    if (this.escortMode === "attack") {
      let currentTarget = this.target;

      if (this.flagship.target && !this.flagship.target.isDestroyed) {
        currentTarget = this.flagship.target;
      }

      if (!currentTarget || currentTarget.isDestroyed) {
        // scan for closest active pirate raider threat
        const hostiles = entities.filter(
          (ent) =>
            ent.type === "ship" &&
            !ent.isDestroyed &&
            AIController.isPirateShip(ent),
        );
        let closestDist = 600;
        for (const pirate of hostiles) {
          const dist = this.ship.position.distance(pirate.position);
          if (dist < closestDist) {
            closestDist = dist;
            currentTarget = pirate;
          }
        }
      }

      if (currentTarget && !currentTarget.isDestroyed) {
        this.target = currentTarget;
        this.ship.target = currentTarget;
        this.steerTowards(currentTarget.position);
        const dist = this.ship.position.distance(currentTarget.position);
        if (dist < 400) {
          this.ship.controls.isThrusting = dist > 140;
          const angle = Math.atan2(
            currentTarget.position.y - this.ship.position.y,
            currentTarget.position.x - this.ship.position.x,
          );
          const headingDiff = Math.abs(
            this.normalizeAngle(angle - this.ship.heading),
          );
          if (headingDiff < 0.25) {
            this.ship.controls.isFiring = true;
          }
        } else {
          this.ship.controls.isThrusting = true;
        }
      } else {
        // Default follow
        this.escortMode = "follow";
      }
      return;
    }

    // 3. Defend Flagship Command (Formation keeping + threat intercepts)
    let threat = null;
    let closestThreatDist = 400;
    for (const ent of entities) {
      if (ent.isDestroyed || ent.type !== "ship") continue;
      if (AIController.isPirateShip(ent)) {
        const distToFlagship = ent.position.distance(this.flagship.position);
        if (distToFlagship < closestThreatDist) {
          closestThreatDist = distToFlagship;
          threat = ent;
        }
      }
    }

    if (threat) {
      // Intercept intruder targeting our flagship
      this.steerTowards(threat.position);
      const dist = this.ship.position.distance(threat.position);
      if (dist < 350) {
        this.ship.controls.isThrusting = dist > 120;
        const angle = Math.atan2(
          threat.position.y - this.ship.position.y,
          threat.position.x - this.ship.position.x,
        );
        const headingDiff = Math.abs(
          this.normalizeAngle(angle - this.ship.heading),
        );
        if (headingDiff < 0.3) {
          this.ship.controls.isFiring = true;
        }
      } else {
        this.ship.controls.isThrusting = true;
      }
    } else {
      // Ensure local flagship properties are tagged on the ship so other players/clients see them
      if (this.flagship) {
        this.ship["flagshipId"] = this.flagship.id;
        this.ship.role = "escort";
      }

      // Filter and sort active sister escorts for the same flagship
      const sisterEscorts = entities.filter(
        (e) =>
          e.type === "ship" &&
          !e.isDestroyed &&
          e["flagshipId"] === this.flagship.id,
      );
      sisterEscorts.sort((a, b) => (a.id < b.id ? -1 : 1));
      const escortIndex = Math.max(0, sisterEscorts.indexOf(this.ship));
      const totalEscorts = Math.max(1, sisterEscorts.length);

      let targetPos;
      const formation = String(this.formation || "orbit");

      if (formation === "delta") {
        // Delta Wing (V-formation behind flagship)
        const distanceBehind = 120 + 60 * Math.floor(escortIndex / 2);
        const sideOffset = 60 * (Math.floor(escortIndex / 2) + 1);
        const angle = this.flagship.heading;
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);
        const leftX = -Math.sin(angle);
        const leftY = Math.cos(angle);

        const isEven = escortIndex % 2 === 0;
        const sideSign = isEven ? 1 : -1;

        targetPos = new Vector2D(
          this.flagship.position.x -
            distanceBehind * forwardX +
            sideOffset * leftX * sideSign,
          this.flagship.position.y -
            distanceBehind * forwardY +
            sideOffset * leftY * sideSign,
        );
      } else {
        // Defensive Orbit (rotating circle around flagship)
        if (this.orbitAngle === undefined) {
          this.orbitAngle = 0;
        }
        this.orbitAngle = (this.orbitAngle + 0.8 * dt) % (2 * Math.PI);
        const angle =
          this.orbitAngle + (2 * Math.PI * escortIndex) / totalEscorts;
        const radius = 150;

        targetPos = new Vector2D(
          this.flagship.position.x + radius * Math.cos(angle),
          this.flagship.position.y + radius * Math.sin(angle),
        );
      }

      // Cruising to target formation position
      const distToTarget = this.ship.position.distance(targetPos);
      if (distToTarget > 15) {
        this.steerTowards(targetPos);
        this.ship.controls.isThrusting = true;
      } else {
        // Match flagship heading and speed when close to slot
        const angleDiff = this.normalizeAngle(
          this.flagship.heading - this.ship.heading,
        );
        if (Math.abs(angleDiff) > 0.08) {
          if (angleDiff > 0) this.ship.controls.isTurningRight = true;
          else this.ship.controls.isTurningLeft = true;
        }
        const flagshipSpeed = this.flagship.velocity.magnitude();
        const mySpeed = this.ship.velocity.magnitude();
        if (mySpeed < flagshipSpeed - 5) {
          this.ship.controls.isThrusting = true;
        } else if (mySpeed > flagshipSpeed + 5) {
          this.ship.controls.isBraking = true;
        }
      }
    }
  }

  /**
   * Helper to wrap angles inside [-PI, PI).
   */
  normalizeAngle(angle) {
    angle = angle % (2 * Math.PI);
    if (angle < -Math.PI) angle += 2 * Math.PI;
    if (angle >= Math.PI) angle -= 2 * Math.PI;
    return angle;
  }

  /**
   * Defensive Regroup maneuver: retreat from threat to safe distance to recharge.
   * @param {Array<SpaceEntity>} entities - All entities.
   */
  executeRegroup(entities) {
    let nearest = null;
    let best = Infinity;
    const isThreat = this.perceptionOptions?.isThreat || defaultIsThreat;

    for (const ent of entities) {
      if (!ent || ent === this.ship || ent.type !== "ship" || ent.isDestroyed) {
        continue;
      }
      if (!isThreat(ent, this.ship)) continue;
      const d = this.ship.position.distance(ent.position);
      if (d < best) {
        best = d;
        nearest = ent;
      }
    }

    if (!nearest) {
      this.ship.controls.isBraking = true;
      return;
    }

    const fleeTarget = new Vector2D(
      this.ship.position.x + (this.ship.position.x - nearest.position.x),
      this.ship.position.y + (this.ship.position.y - nearest.position.y),
    );
    this.steerTowards(fleeTarget);

    const energy = this.ship.energy !== undefined ? this.ship.energy : 100;
    if (energy > 20) {
      this.ship.controls.isThrusting = true;
    } else {
      this.ship.controls.isBraking = true;
    }
  }

  executeTrade(entities) {
    let bestPlanet = null;
    let bestScore = -1;

    const list = /** @type {Array<*>} */ Array.isArray(entities)
      ? entities
      : [];
    const planets = list.filter(
      (e) => e && e.type === "planet" && !e.isDestroyed,
    );
    if (planets.length === 0) {
      this.executeWander(0.016);
      return;
    }

    for (const ent of planets) {
      const dist = this.ship.position.distance(ent.position);
      if (dist > 2000) continue;

      if (this.ship.faction && ent.faction && this.factionPolicy) {
        if (this.factionPolicy.isHostile(this.ship.faction, ent.faction)) {
          continue;
        }
      }

      // Calculate profit spread for this planet relative to other planets
      const otherPlanets = planets.filter((p) => p !== ent && p.market);
      let maxSpread = 0;
      if (ent.market && otherPlanets.length > 0) {
        const commodities = [
          "food",
          "electronics",
          "minerals",
          "luxuries",
          "contraband",
          "machinery",
          "ore",
        ];
        for (const item of commodities) {
          const priceHere = ent.market[item];
          if (typeof priceHere !== "number") continue;
          for (const other of otherPlanets) {
            const priceThere = other.market[item];
            if (typeof priceThere !== "number") continue;
            const diff = Math.abs(priceHere - priceThere);
            if (diff > maxSpread) {
              maxSpread = diff;
            }
          }
        }
      }

      // Map spread from 0 to 300 to a profit value in [0.2, 0.95] clamped
      const profit = 0.2 + 0.75 * Math.min(maxSpread / 300, 1);

      // Score balance: higher profit, closer distance
      let score = profit * 1000 + (2000 - dist);

      if (this.ship.faction && ent.faction && this.factionPolicy) {
        if (this.factionPolicy.isAllied(this.ship.faction, ent.faction)) {
          score += 200;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPlanet = ent;
      }
    }

    if (!bestPlanet) {
      this.executeWander(0.016);
      return;
    }

    this.destination = bestPlanet.position;
    this.steerTowards(this.destination);

    const planet = /** @type {*} */ bestPlanet;
    const dist = this.ship.position.distance(this.destination);
    const landingRadius =
      planet.landingRadius !== undefined ? planet.landingRadius : 60;
    if (dist < landingRadius + 40) {
      this.ship.controls.isBraking = true;
    } else {
      this.ship.controls.isThrusting = true;
    }
  }

  /**
   * Offensive Engage behavior: chase and attack the selected weak target.
   * @param {Array<SpaceEntity>} entities - All entities.
   * @param {number} dt - Frame time step.
   */
  executeEngage(entities, dt) {
    if (this.target && !this.target.isDestroyed) {
      this.steerTowards(this.target.position);
      const dist = this.ship.position.distance(this.target.position);
      if (dist < 400) {
        this.ship.controls.isThrusting = dist > 150;
        const angleToTarget = Math.atan2(
          this.target.position.y - this.ship.position.y,
          this.target.position.x - this.ship.position.x,
        );
        const headingDiff = Math.abs(
          this.normalizeAngle(angleToTarget - this.ship.heading),
        );
        if (headingDiff < 0.25) {
          this.ship.controls.isFiring = true;
        }
      } else {
        this.ship.controls.isThrusting = true;
      }
    } else {
      this.executeWander(dt);
    }
  }

  /**
   * Caravan AI state machine behavior for cargo fleets.
   * @param {number} dt - Frame time step.
   * @param {Array<any>} entities - All simulated entities.
   */
  executeCaravanAI(dt, entities) {
    if (!this.producerPlanetName || !this.consumerPlanetName) {
      if (this.isSmuggler) {
        this.producerPlanetName = "Rogue's Hollow";
        const planets = entities.filter(
          (e) => e.type === "planet" && e.name !== "Rogue's Hollow",
        );
        if (planets.length > 0) {
          this.consumerPlanetName = planets[0].name;
        } else {
          this.consumerPlanetName = "Sol Prime";
        }
        this.targetPlanetName = this.producerPlanetName;
        this.caravanState = "loading";
      } else {
        const planets = entities.filter((e) => e.type === "planet");
        if (planets.length >= 2) {
          const prod =
            planets.find((p) => p.name === "New Polaris") || planets[0];
          const cons =
            planets.find((p) => p.name === "Sigma Draconis") || planets[1];
          this.producerPlanetName = prod.name;
          this.consumerPlanetName = cons.name;
          this.targetPlanetName = this.producerPlanetName;
          this.caravanState = "loading";
        } else {
          this.executeWander(dt);
          return;
        }
      }
    }

    const currentSector = this.getCurrentSector();

    if (this.caravanState === "loading") {
      const planet = entities.find((e) => e.name === this.producerPlanetName);
      if (planet) {
        this.destination = planet.position;
        const dist = this.ship.position.distance(this.destination);
        const speed = this.ship.velocity.magnitude();

        if (dist < 80 && speed < 5) {
          if (this.isSmuggler) {
            const available = planet.market ? planet.market.contraband || 0 : 0;
            const toBuy = Math.min(10, available || 20);
            if (planet.market && planet.market.contraband !== undefined) {
              planet.market.contraband = Math.max(
                0,
                planet.market.contraband - toBuy,
              );
            }
            this.caravanCargo = { item: "contraband", amount: toBuy };
            this.ship.cargo = this.ship.cargo || {};
            this.ship.cargo.contraband =
              (this.ship.cargo.contraband || 0) + toBuy;
          } else {
            // Perform transaction: buy/load ore
            if (planet.market && planet.market.ore !== undefined) {
              const available = planet.market.ore;
              const toBuy = Math.min(20, available);
              planet.market.ore = Math.max(0, planet.market.ore - toBuy);
              this.caravanCargo = { item: "ore", amount: toBuy };
            }
          }

          // Set target to consumer planet and compute route
          this.targetPlanetName = this.consumerPlanetName;
          const targetPlanet = entities.find(
            (e) => e.name === this.targetPlanetName,
          );
          const targetSector = targetPlanet ? targetPlanet.sector : "frontier";
          this.route = this.planRoute(currentSector, targetSector);
          this.caravanState = "traveling";
        }
      }
    } else if (this.caravanState === "unloading") {
      const planet = entities.find((e) => e.name === this.consumerPlanetName);
      if (planet) {
        this.destination = planet.position;
        const dist = this.ship.position.distance(this.destination);
        const speed = this.ship.velocity.magnitude();

        if (dist < 80 && speed < 5) {
          if (this.isSmuggler) {
            const toSell = this.caravanCargo ? this.caravanCargo.amount : 0;
            if (planet.market) {
              planet.market.contraband =
                (planet.market.contraband || 0) + toSell;
            }
            this.ship.cargo = this.ship.cargo || {};
            this.ship.cargo.contraband = Math.max(
              0,
              (this.ship.cargo.contraband || 0) - toSell,
            );
          } else {
            // Perform transaction: sell/unload ore
            if (planet.market) {
              const toSell = this.caravanCargo ? this.caravanCargo.amount : 0;
              planet.market.ore = (planet.market.ore || 0) + toSell;
            }
          }
          this.caravanCargo = null;

          // Set target back to producer planet and compute route
          this.targetPlanetName = this.producerPlanetName;
          const targetPlanet = entities.find(
            (e) => e.name === this.targetPlanetName,
          );
          const targetSector = targetPlanet ? targetPlanet.sector : "frontier";
          this.route = this.planRoute(currentSector, targetSector);
          this.caravanState = "traveling";
        }
      }
    } else if (this.caravanState === "traveling") {
      if (this.route && this.route.length > 0) {
        const nextSector = this.route[0];
        const gate = entities.find(
          (e) =>
            e.type === "warp_gate" &&
            e.sector === currentSector &&
            e.targetSector === nextSector,
        );

        if (gate) {
          this.destination = gate.position;
          const dist = this.ship.position.distance(gate.position);

          if (dist < 100) {
            // Jump stargates!
            this.ship.position = gate.targetPosition.clone();
            this.ship.velocity = new Vector2D(0, 0);
            this.route.shift();

            // Recompute destination for the next tick
            this.destination = null;
          }
        }
      } else {
        const targetPlanet = entities.find(
          (e) => e.name === this.targetPlanetName,
        );
        if (targetPlanet) {
          this.destination = targetPlanet.position;
          const dist = this.ship.position.distance(this.destination);
          const speed = this.ship.velocity.magnitude();

          if (dist < 80 && speed < 5) {
            if (this.caravanCargo && this.caravanCargo.amount > 0) {
              this.caravanState = "unloading";
            } else {
              this.caravanState = "loading";
            }
          }
        }
      }
    }

    if (this.destination) {
      this.steerTowards(this.destination);

      const dist = this.ship.position.distance(this.destination);
      const isGate = this.route && this.route.length > 0;
      if (dist < 80 && !isGate) {
        this.ship.controls.isThrusting = false;
        this.ship.controls.isBraking = true;
      } else {
        this.ship.controls.isThrusting = true;
      }
    }
  }

  getCurrentSector() {
    const x = this.ship.position.x;
    if (x > 10000) return "frontier";
    if (x < -10000) return "rim";
    return "core";
  }

  planRoute(startSector, endSector) {
    if (startSector === endSector) return [];
    if (startSector === "core" && endSector === "rim") {
      return ["frontier", "rim"];
    }
    if (startSector === "rim" && endSector === "core") {
      return ["frontier", "core"];
    }
    return [endSector];
  }
}
