import { SpaceEntity } from "./SpaceEntity.js";

/**
 * Class representing physical floating cargo pods ejected from shattered asteroids or destroyed ships.
 */
export class CargoPod extends SpaceEntity {
  declare amount;
  declare isTrainingSalvage;
  declare resourceType;
  /**
   * Creates a CargoPod.
   * @param {Object} [config] - `resourceType`, `amount`, plus any baseline
   *   `SpaceEntity` fields (position/velocity/…) collected into `parentParams`.
   */
  constructor({
    resourceType = "minerals",
    amount = 1,
    ...parentParams
  }: any = {}) {
    // Cargo pods are light, drift physical objects with radius 8 and mass 50
    super({
      type: "cargo_pod",
      mass: 50,
      radius: 8,
      ...parentParams,
    });

    this.resourceType = resourceType;
    this.amount = amount;
    this.isTrainingSalvage = false;

    // Seed slow spinning drift motion
    this.heading = Math.random() * Math.PI * 2;
    this.angularVelocity = (Math.random() - 0.5) * 1.5;
  }
}
