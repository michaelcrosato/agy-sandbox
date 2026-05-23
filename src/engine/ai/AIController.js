/**
 * AIController manages NPC behavior states (wander, chase, patrol, trade) and maps them into ship controls.
 */
export class AIController {
  /**
   * Creates an AIController for a ship.
   * @param {Ship} ship - The ship being controlled.
   * @param {string} [role] - AI role ("pirate", "merchant", "guard").
   */
  constructor(ship, role = "merchant") {
    this.ship = ship;
    this.role = role;

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
      if (dist < closestDist) {
        if (this.role === "pirate") {
          // Pirates target any player or non-pirate ship
          const isAnotherPirate = ent.name === "Pirate Raider" || 
                                  ent.name === "Siege Raider" || 
                                  ent.name.includes("Pirate") || 
                                  ent.name.includes("Raider");
          if (!isAnotherPirate) {
            closestTarget = ent;
            closestDist = dist;
          }
        } else if (this.role === "guard") {
          // Guards target pirate ships
          const isThreat = ent.name === "Pirate Raider" || 
                           ent.name === "Siege Raider" || 
                           ent.name.includes("Pirate") || 
                           ent.name.includes("Raider");
          if (isThreat) {
            closestTarget = ent;
            closestDist = dist;
          }
        }
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
        const hostiles = entities.filter(ent =>
          ent.type === "ship" && !ent.isDestroyed &&
          (ent.name === "Pirate Raider" || ent.name.includes("Pirate")));
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
          const angle = Math.atan2(currentTarget.position.y - this.ship.position.y, currentTarget.position.x - this.ship.position.x);
          const headingDiff = Math.abs(this.normalizeAngle(angle - this.ship.heading));
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
      const isPirate = ent.name === "Pirate Raider" || ent.name.includes("Pirate") || ent.name.includes("Raider");
      if (isPirate) {
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
        const angle = Math.atan2(threat.position.y - this.ship.position.y, threat.position.x - this.ship.position.x);
        const headingDiff = Math.abs(this.normalizeAngle(angle - this.ship.heading));
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
        const angleDiff = this.normalizeAngle(this.flagship.heading - this.ship.heading);
        if (Math.abs(angleDiff) > 0.08) {
          if (angleDiff > 0) this.ship.controls.isTurningRight = true;
          else this.ship.controls.isTurningLeft = true;
        }
        // Match speed relative to target flagship
        if (this.ship.velocity.magnitude() < this.flagship.velocity.magnitude()) {
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
