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
  }

  /**
   * Evaluates sensors and updates ship control flags.
   * @param {number} dt - Time delta in seconds.
   * @param {Array<SpaceEntity>} entities - All active entities in the space simulation.
   */
  update(dt, entities) {
    if (this.ship.isDestroyed) return;

    this.ship.clearControls();

    // 1. Scan for targets if necessary
    this.scanSensors(entities);

    // 2. Perform state machine navigation
    if (this.role === "pirate") {
      this.executePirateAI(dt);
    } else if (this.role === "guard") {
      this.executeGuardAI(dt);
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
          if (ent.name !== "Pirate Raider") {
            closestTarget = ent;
            closestDist = dist;
          }
        } else if (this.role === "guard") {
          // Guards target pirate ships
          if (ent.name === "Pirate Raider") {
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
        this.ship.controls.isTurningLeft = true;
      } else {
        this.ship.controls.isTurningRight = true;
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
        this.ship.controls.isTurningLeft = true;
      } else {
        this.ship.controls.isTurningRight = true;
      }
    } else {
      // Gently cruise forward
      this.ship.controls.isThrusting = Math.random() > 0.3;
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
