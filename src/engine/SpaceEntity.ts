import { Vector2D } from "../physics/Vector2D.js";

/**
 * Base class representing a physical object in a 2D top-down space environment.
 */
export class SpaceEntity {
  declare _isDestroyed;
  declare accumulatorForce;
  declare angularVelocity;
  declare destroyedBy;
  declare faction;
  declare heading;
  declare id;
  declare mass;
  declare name;
  declare position;
  declare radius;
  declare role;
  declare sector;
  declare targetPosition;
  declare targetSector;
  declare type;
  declare velocity;
  /**
   * Creates a SpaceEntity.
   * @param {Object} config - Configuration parameters.
   * @param {string} [config.id] - Unique identifier.
   * @param {string} [config.type] - Entity classification type (e.g. "asteroid", "debris").
   * @param {Vector2D} [config.position] - Initial position vector.
   * @param {Vector2D} [config.velocity] - Initial velocity vector.
   * @param {number} [config.mass] - Mass in kilograms.
   * @param {number} [config.heading] - Initial angle heading in radians (0 = East/Right, positive counter-clockwise).
   * @param {number} [config.angularVelocity] - Rotational speed in radians per second.
   * @param {number} [config.radius] - Boundary size for circle collision detection.
   */
  constructor({
    id = Math.random().toString(36).substring(2, 9),
    type = "generic",
    position = new Vector2D(0, 0),
    velocity = new Vector2D(0, 0),
    mass = 1000,
    heading = 0,
    angularVelocity = 0,
    radius = 10,
  } = {}) {
    this.id = id;
    this.type = type;
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.mass = mass;
    this.heading = heading;
    this.angularVelocity = angularVelocity;
    this.radius = radius;

    // Universal lifecycle + identity fields, declared so the type model and the
    // combat/AI consumers can rely on them. Subclasses/NPCs set name/role/faction;
    // the engine toggles isDestroyed/destroyedBy on death.
    this._isDestroyed = false;
    /** @type {string|null} */
    this.destroyedBy = null;
    /** @type {string|undefined} */
    this.name = undefined;
    /** @type {string|null} */
    this.role = null;
    /** @type {string|null} */
    this.faction = null;

    // Temporary force accumulator reset on every physics frame update
    this.accumulatorForce = new Vector2D(0, 0);
  }

  /**
   * Applies a linear force to the entity.
   * Accumulated forces will alter velocity on the subsequent update tick.
   * @param {Vector2D} force - The force vector in Newtons.
   */
  applyForce(force) {
    this.accumulatorForce = this.accumulatorForce.add(force);
  }

  /**
   * Advances the physical state of the entity by dt seconds.
   * Integrates acceleration into velocity, velocity into position, and angular velocity into heading.
   * @param {number} dt - Elapsed frame delta time in seconds.
   */
  update(dt) {
    if (dt <= 0) return;

    // F = m * a => a = F / m
    const acceleration =
      this.mass > 0
        ? this.accumulatorForce.multiply(1 / this.mass)
        : new Vector2D(0, 0);

    // Update velocity: v = v + a * dt
    this.velocity = this.velocity.add(acceleration.multiply(dt));

    // Update position: r = r + v * dt
    this.position = this.position.add(this.velocity.multiply(dt));

    // Update angular rotation: theta = theta + omega * dt
    this.heading += this.angularVelocity * dt;
    this.normalizeHeading();

    // Reset force accumulator for the next frame
    this.accumulatorForce = new Vector2D(0, 0);
  }

  /**
   * Ensures the heading stays bounded within standard [-PI, PI) radians.
   */
  normalizeHeading() {
    this.heading = this.heading % (2 * Math.PI);
    if (this.heading < -Math.PI) {
      this.heading += 2 * Math.PI;
    } else if (this.heading >= Math.PI) {
      this.heading -= 2 * Math.PI;
    }
  }

  /**
   * Computes the heading direction as a normalized 2D Vector.
   * @returns {Vector2D} Normalized unit direction vector.
   */
  getDirectionVector() {
    return new Vector2D(Math.cos(this.heading), Math.sin(this.heading));
  }

  /**
   * @returns {boolean}
   */
  get isDestroyed() {
    return this._isDestroyed;
  }

  /**
   * @param {boolean} val
   */
  set isDestroyed(val) {
    this._isDestroyed = val;
  }
}
