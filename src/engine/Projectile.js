import { SpaceEntity } from "./SpaceEntity.js";
import { Vector2D } from "../physics/Vector2D.js";

/**
 * Projectile class representing weapon discharges (e.g. laser bolts, plasma cells) in space.
 */
export class Projectile extends SpaceEntity {
  /**
   * Creates a Projectile.
   * @param {Object} config - Configuration parameters.
   * @param {string} config.ownerId - ID of the ship that launched this projectile.
   * @param {number} [config.damage] - Collision damage (default 15).
   * @param {number} [config.speed] - Initial firing speed magnitude (default 500).
   * @param {number} [config.range] - Max travel distance (default 600).
   * @param {Vector2D} config.startPosition - Initial coordinate.
   * @param {number} config.heading - Launch heading in radians.
   * @param {Vector2D} [config.ownerVelocity] - Additive velocity from the shooting ship.
   * @param {number} [config.shieldPierce] - Fraction (0..1) of damage that bypasses shields.
   */
  constructor({
    ownerId,
    damage = 15,
    speed = 500,
    range = 600,
    startPosition,
    heading,
    ownerVelocity = new Vector2D(0, 0),
    shieldPierce = 0,
  }) {
    // Projectiles are fast, light entities with a small radius
    const headingDir = new Vector2D(Math.cos(heading), Math.sin(heading));
    const launchVelocity = headingDir.multiply(speed).add(ownerVelocity);

    super({
      type: "projectile",
      position: startPosition,
      velocity: launchVelocity,
      mass: 1, // extremely light
      heading: heading,
      radius: 3, // tiny bounding circle
    });

    this.ownerId = ownerId;
    this.damage = damage;
    this.shieldPierce = shieldPierce;
    this.maxLifetime = range / speed; // in seconds
    this.lifetime = this.maxLifetime;
  }

  /**
   * Decrements lifetime and advances position kinematics.
   * @param {number} dt - Frame time step in seconds.
   */
  update(dt) {
    if (dt <= 0) return;
    this.lifetime -= dt;
    super.update(dt);
  }

  /**
   * Checks whether the projectile has exceeded its range or lifetime.
   * @returns {boolean} True if expired.
   */
  get isExpired() {
    return this.lifetime <= 0;
  }
}
