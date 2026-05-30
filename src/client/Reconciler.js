import { Vector2D } from "../physics/Vector2D.js";

/**
 * Client-Side Input Prediction & Server Reconciliation Reconciler (spec 071).
 *
 * Simulates ship movements locally on input commands (prediction) and reapplies
 * enqueued inputs on top of server authoritative baselines (reconciliation).
 */
export class Reconciler {
  /**
   * Creates a Reconciler.
   * @param {Object} [config]
   * @param {number} [config.mass=2000] - Base ship mass.
   * @param {number} [config.thrustPower=8000] - Base thrust power force.
   * @param {number} [config.brakePower=4000] - Base retro-brake deceleration magnitude.
   * @param {number} [config.turnRate=3.0] - Effective turn rate in radians per second.
   * @param {number} [config.maxSpeed=400] - Maximum velocity speed cap.
   */
  constructor({
    mass = 2000,
    thrustPower = 8000,
    brakePower = 4000,
    turnRate = 3.0,
    maxSpeed = 400,
  } = {}) {
    this.mass = mass;
    this.thrustPower = thrustPower;
    this.brakePower = brakePower;
    this.turnRate = turnRate;
    this.maxSpeed = maxSpeed;

    /** @type {Array<{sequence: number, controls: Object, dt: number}>} */
    this.pendingInputs = [];
    this.inputSequence = 0;
  }

  /**
   * Enqueues and applies a local input vector.
   * @param {Object} shipState - Current predicted client ship state `{ position, velocity, heading }`.
   * @param {Object} controls - `{ isThrusting?, isTurningLeft?, isTurningRight?, isBraking? }`.
   * @param {number} dt - Frame delta time in seconds.
   * @returns {Object} Newly predicted ship state.
   */
  predict(shipState, controls, dt) {
    this.inputSequence++;
    const input = {
      sequence: this.inputSequence,
      controls: { ...controls },
      dt,
    };
    this.pendingInputs.push(input);

    return this.simulate(shipState, controls, dt);
  }

  /**
   * Reconciles local state with authoritative server updates by replaying unacknowledged inputs.
   * @param {Object} serverState - Authoritative state `{ position, velocity, heading, lastProcessedInputSequence }`.
   * @returns {Object} Newly reconciled and predicted client state.
   */
  reconcile(serverState) {
    // Discard enqueued inputs up to lastProcessedInputSequence
    if (serverState.lastProcessedInputSequence !== undefined) {
      this.pendingInputs = this.pendingInputs.filter(
        (input) => input.sequence > serverState.lastProcessedInputSequence,
      );
    }

    // Set starting state to server's authoritative state
    let state = {
      position: new Vector2D(serverState.position.x, serverState.position.y),
      velocity: new Vector2D(serverState.velocity.x, serverState.velocity.y),
      heading: serverState.heading,
    };

    // Replay all remaining enqueued inputs on top of server state
    for (const input of this.pendingInputs) {
      state = this.simulate(state, input.controls, input.dt);
    }

    return state;
  }

  /**
   * Simulates a single physical update step.
   * @param {Object} state - Starting state `{ position, velocity, heading }`.
   * @param {Object} controls - Steer and thrust commands.
   * @param {number} dt - Delta time in seconds.
   * @returns {Object} Next state.
   */
  simulate(state, controls, dt) {
    if (dt <= 0) return { ...state };

    let heading = state.heading;
    let velocity = new Vector2D(state.velocity.x, state.velocity.y);
    let position = new Vector2D(state.position.x, state.position.y);

    // 1. Process steering
    let angularVelocity = 0;
    if (controls.isTurningLeft && !controls.isTurningRight) {
      angularVelocity = -this.turnRate;
    } else if (controls.isTurningRight && !controls.isTurningLeft) {
      angularVelocity = this.turnRate;
    }
    heading += angularVelocity * dt;

    // Normalize heading: [-PI, PI)
    heading = heading % (2 * Math.PI);
    if (heading < -Math.PI) {
      heading += 2 * Math.PI;
    } else if (heading >= Math.PI) {
      heading -= 2 * Math.PI;
    }

    // 2. Accumulate forces
    let force = new Vector2D(0, 0);

    // Thrust force
    if (controls.isThrusting) {
      const direction = new Vector2D(Math.cos(heading), Math.sin(heading));
      force = force.add(direction.multiply(this.thrustPower));
    }

    // Brake retro force
    if (controls.isBraking) {
      const speed = velocity.magnitude();
      if (speed > 0.01) {
        const brakeDirection = velocity.normalize().multiply(-1);
        const maxDecelForce = (speed * this.mass) / dt;
        const actualBrakeForceMagnitude = Math.min(this.brakePower, maxDecelForce);
        force = force.add(brakeDirection.multiply(actualBrakeForceMagnitude));
      }
    }

    // Acceleration
    const acceleration = force.multiply(1 / this.mass);

    // Integration
    velocity = velocity.add(acceleration.multiply(dt));
    position = position.add(velocity.multiply(dt));

    // Cap maximum terminal speed
    const currentSpeed = velocity.magnitude();
    if (currentSpeed > this.maxSpeed) {
      velocity = velocity.normalize().multiply(this.maxSpeed);
    }

    return { position, velocity, heading };
  }
}
