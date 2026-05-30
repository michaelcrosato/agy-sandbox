import { buildPerception, defaultIsThreat } from "./buildPerception.js";
import { selectGoal, Goals } from "./UtilityAI.js";

/**
 * AIController manages NPC behavior states (wander, chase, patrol, trade) and maps them into ship controls.
 */
export class AIController {
  /**
   * Creates an AIController for a ship.
   * @param {Ship} ship - The ship being controlled.
   * @param {string} [role] - AI role ("pirate", "merchant", "guard").
   * @param {Object} [options] - Optional configuration.
   * @param {Object} [options.factionPolicy] - Pairwise faction relation view
   *   exposing `isHostile(a, b)` and `isAllied(a, b)`. When set AND both the
   *   self ship and a candidate target carry a `faction` tag, target
   *   selection uses faction relations; otherwise the legacy name-based
   *   classifier (`isPirateShip`) is used unchanged.
   * @param {boolean} [options.useUtilityAdvisor=false] - When true, a pure
   *   `UtilityAI` goal (from a `buildPerception` snapshot) is consulted each
   *   tick and can override the role FSM (currently FLEE pre-empts with an
   *   evade). Default off so existing call sites/tests keep exact legacy
   *   behaviour; new server spawns opt in.
   * @param {Object} [options.perceptionOptions] - Optional overrides for
   *   `buildPerception` (e.g. faction-aware `isThreat`).
   */
  constructor(
    ship,
    role = "merchant",
    {
      factionPolicy = null,
      standingPolicy = null,
      useUtilityAdvisor = false,
      perceptionOptions = null,
    } = {},
  ) {
    this.ship = ship;
    this.role = role;
    this.factionPolicy = factionPolicy;
    // Per-player standing view (spec 016) — lets a guard target a player whose
    // standing with the guard's faction is hostile. Null ⇒ legacy targeting.
    this.standingPolicy = standingPolicy;
    this.useUtilityAdvisor = useUtilityAdvisor;
    this.perceptionOptions = perceptionOptions;

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
  }

  /**
   * Evaluates sensors and updates ship control flags.
   * @param {number} dt - Time delta in seconds.
   * @param {Array<SpaceEntity>} entities - All active entities in the space simulation.
   */
  update(dt, entities) {
    if (this.ship.isDestroyed || this.ship.isDisabled) return;

    this.ship.clearControls();

    // 1. Scan for targets if necessary
    this.scanSensors(entities);

    // 1b. Advisory goal layer (spec 017): when enabled, a UtilityAI goal can
    // pre-empt the role FSM. Only FLEE overrides today — a pressured agent
    // breaks off and evades regardless of role, which is the cross-role plan
    // change the role FSMs can't express (a merchant has no combat state at
    // all). Every other goal falls through to the legacy role behaviour, which
    // already maps ENGAGE→attack / TRADE→route / PATROL→wander.
    if (this.useUtilityAdvisor) {
      const perception = buildPerception(
        this.ship,
        entities,
        this.perceptionOptions || undefined,
      );
      this.currentGoal = selectGoal(perception).goal;
      if (this.currentGoal === Goals.FLEE) {
        this.executeFlee(entities);
        return;
      }
    }

    // 2. Perform state machine navigation
    if (this.role === "pirate") {
      this.executePirateAI(dt);
    } else if (this.role === "guard") {
      this.executeGuardAI(dt);
    } else if (this.role === "escort") {
      this.executeEscortAI(dt, entities);
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

  /**
   * Searches for suitable nearby targets depending on role.
   * @param {Array<SpaceEntity>} entities - All entities.
   */
  scanSensors(entities) {
    const sensorRange = 500;
    let closestTarget = null;
    let closestDist = sensorRange;

    for (const ent of entities) {
      if (ent.id === this.ship.id || ent.isDestroyed || ent.type !== "ship") {
        continue;
      }

      const dist = this.ship.position.distance(ent.position);
      if (dist < closestDist && this.shouldTarget(ent)) {
        closestTarget = ent;
        closestDist = dist;
      }
    }

    this.target = closestTarget;
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
  executeGuardAI(dt) {
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
   * @param {Vector2D} targetPos - Coordinate vector to navigate to.
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
   * @param {Array<SpaceEntity>} entities - All entities.
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
    const fleeTarget = {
      x: this.ship.position.x + (this.ship.position.x - nearest.position.x),
      y: this.ship.position.y + (this.ship.position.y - nearest.position.y),
    };
    this.steerTowards(fleeTarget);
    this.ship.controls.isThrusting = true;
  }

  /**
   * Defensive Escort autopilot executing defend formation or target interception commands.
   * @param {number} dt - Frame time step.
   * @param {Array<SpaceEntity>} entities - All entities.
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

    // 2. Focus Attack Command - find and intercept hostile target
    if (this.escortMode === "attack") {
      let currentTarget = this.target;

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
      // Formation cruising behind flagship
      const distToFlag = this.ship.position.distance(this.flagship.position);
      if (distToFlag > 160) {
        this.steerTowards(this.flagship.position);
        this.ship.controls.isThrusting = true;
      } else if (distToFlag < 70) {
        this.ship.controls.isBraking = true;
      } else {
        // Gently match flagship heading
        const angleDiff = this.normalizeAngle(
          this.flagship.heading - this.ship.heading,
        );
        if (Math.abs(angleDiff) > 0.08) {
          if (angleDiff > 0) this.ship.controls.isTurningRight = true;
          else this.ship.controls.isTurningLeft = true;
        }
        // Match speed relative to target flagship
        if (
          this.ship.velocity.magnitude() < this.flagship.velocity.magnitude()
        ) {
          this.ship.controls.isThrusting = true;
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
}
