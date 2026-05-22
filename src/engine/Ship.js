import { SpaceEntity } from "./SpaceEntity.js";

/**
 * Ship class extending SpaceEntity to add controls, engine thrusters, and turning parameters.
 */
export class Ship extends SpaceEntity {
  /**
   * Creates a Ship entity.
   * @param {Object} config - Configuration parameters.
   * @param {number} [config.thrustPower] - Forward propulsion force in Newtons (default 8000).
   * @param {number} [config.brakePower] - Retro-propulsion force in Newtons (default 4000).
   * @param {number} [config.turnRate] - Standard turning speed in radians/second (default 2.5).
   * @param {number} [config.maxSpeed] - Speed cap in units/second (default 300).
   * @param {Object} [config.parentParams] - Remaining baseline entity properties.
   */
  constructor({
    thrustPower = 8000,
    brakePower = 4000,
    turnRate = 2.5,
    maxSpeed = 300,
    ...parentParams
  } = {}) {
    // Override some generic defaults for Ship classification
    super({ type: "ship", mass: 2000, radius: 15, ...parentParams });

    this.thrustPower = thrustPower;
    this.brakePower = brakePower;
    this.turnRate = turnRate;
    this.maxSpeed = maxSpeed;

    // Controls state map
    this.controls = {
      isThrusting: false,
      isBraking: false,
      isTurningLeft: false,
      isTurningRight: false,
    };
  }

  /**
   * Helper to set multiple control values simultaneously.
   * @param {Object} controlStates - Object containing control states to override.
   */
  setControls(controlStates) {
    this.controls = { ...this.controls, ...controlStates };
  }

  /**
   * Resets all steering and propulsion commands.
   */
  clearControls() {
    this.controls.isThrusting = false;
    this.controls.isBraking = false;
    this.controls.isTurningLeft = false;
    this.controls.isTurningRight = false;
  }

  /**
   * Overridden update loop. Maps engine controls into linear/rotational forces before advancing physics.
   * @param {number} dt - Frame time step in seconds.
   */
  update(dt) {
    if (dt <= 0) return;

    // --- Rotational Control Integration ---
    if (this.controls.isTurningLeft && !this.controls.isTurningRight) {
      this.angularVelocity = this.turnRate;
    } else if (this.controls.isTurningRight && !this.controls.isTurningLeft) {
      this.angularVelocity = -this.turnRate;
    } else {
      this.angularVelocity = 0;
    }

    // --- Linear Propulsion Control Integration ---
    if (this.controls.isThrusting) {
      // Thrust direction matches heading vector
      const direction = this.getDirectionVector();
      const thrustForce = direction.multiply(this.thrustPower);
      this.applyForce(thrustForce);
    }

    // --- Retro-Brake Propulsion Control Integration ---
    if (this.controls.isBraking) {
      const speed = this.velocity.magnitude();
      if (speed > 0.01) {
        // Brake force is applied exactly opposite to the velocity direction
        const brakeDirection = this.velocity.normalize().multiply(-1);

        // Ensure braking doesn't cause the ship to reverse or overshoot back
        const maxDecelForce = (speed * this.mass) / dt;
        const actualBrakeForceMagnitude = Math.min(
          this.brakePower,
          maxDecelForce,
        );

        const brakeForce = brakeDirection.multiply(actualBrakeForceMagnitude);
        this.applyForce(brakeForce);
      }
    }

    // Advance physical kinematics
    super.update(dt);

    // Apply speed limit cap (frictionless absolute terminal velocity)
    const currentSpeed = this.velocity.magnitude();
    if (currentSpeed > this.maxSpeed) {
      this.velocity = this.velocity.normalize().multiply(this.maxSpeed);
    }
  }
}
