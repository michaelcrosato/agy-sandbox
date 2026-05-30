import { SpaceEntity } from "./SpaceEntity.js";
import { Vector2D } from "../physics/Vector2D.js";

/**
 * Headless representation of a server-authoritative wandering cosmic storm.
 * Moves dynamically across sector space and affects ships that enter its radius.
 * Extends SpaceEntity for physics engine compatibility and static analysis compliance.
 */
export class CosmicStorm extends SpaceEntity {
  /**
   * Creates a CosmicStorm instance.
   * @param {Object} [config]
   * @param {string} [config.id] - Unique identifier.
   * @param {string} [config.name] - Name of the anomaly.
   * @param {string} [config.description] - Description of hazard.
   * @param {Vector2D} [config.position] - Position vector.
   * @param {number} [config.radius] - Area-of-effect radius.
   * @param {Vector2D} [config.velocity] - Drift velocity vector.
   * @param {string} [config.hazardType] - "emp_storm" | "radioactive_cloud".
   * @param {string} [config.color] - RGBA color for client display.
   * @param {string} [config.particleColor] - RGBA color for visual dust.
   */
  constructor({
    id,
    name,
    description,
    position = new Vector2D(0, 0),
    radius = 300,
    velocity = new Vector2D(0, 0),
    hazardType = "emp_storm",
    color = "rgba(255, 140, 0, 0.12)",
    particleColor = "rgba(255, 140, 0, 0.35)",
  } = {}) {
    super({
      id,
      type: "cosmic_storm",
      position,
      velocity,
      radius,
    });
    this.name = name;
    this.description = description;
    this.hazardType = hazardType;
    this.color = color;
    this.particleColor = particleColor;
  }

  /**
   * Checks whether a given position vector is inside the storm's hazard zone.
   * @param {Vector2D} pos - Position to check.
   * @returns {boolean} True if inside the radius.
   */
  isInside(pos) {
    if (!pos || typeof pos.distance !== "function") return false;
    return this.position.distance(pos) <= this.radius;
  }

  /**
   * Returns a JSON-serializable snapshot of this storm.
   * @returns {Object}
   */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      position: { x: this.position.x, y: this.position.y },
      radius: this.radius,
      velocity: { x: this.velocity.x, y: this.velocity.y },
      hazardType: this.hazardType,
      color: this.color,
      particleColor: this.particleColor,
    };
  }

  /**
   * Restores a CosmicStorm from JSON.
   * @param {Object} data
   * @returns {CosmicStorm}
   */
  static fromJSON(data = {}) {
    return new CosmicStorm({
      id: data.id,
      name: data.name,
      description: data.description,
      position: new Vector2D(data.position?.x, data.position?.y),
      radius: data.radius,
      velocity: new Vector2D(data.velocity?.x, data.velocity?.y),
      hazardType: data.hazardType,
      color: data.color,
      particleColor: data.particleColor,
    });
  }
}
