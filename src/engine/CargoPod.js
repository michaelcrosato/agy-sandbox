import { SpaceEntity } from "./SpaceEntity.js";

/**
 * Class representing physical floating cargo pods ejected from shattered asteroids or destroyed ships.
 */
export class CargoPod extends SpaceEntity {
  /**
   * Creates a CargoPod.
   * @param {Object} config - Configuration parameters.
   * @param {string} [config.resourceType] - Type of resource (minerals, luxuries, contraband, machinery, food, electronics).
   * @param {number} [config.amount] - Units of cargo contained (default 1).
   * @param {Object} [config.parentParams] - Remaining baseline entity properties.
   */
  constructor({
    resourceType = "minerals",
    amount = 1,
    ...parentParams
  } = {}) {
    // Cargo pods are light, drift physical objects with radius 8 and mass 50
    super({
      type: "cargo_pod",
      mass: 50,
      radius: 8,
      ...parentParams,
    });

    this.resourceType = resourceType;
    this.amount = amount;
    
    // Seed slow spinning drift motion
    this.heading = Math.random() * Math.PI * 2;
    this.angularVelocity = (Math.random() - 0.5) * 1.5;
  }
}
