import { Vector2D } from "../physics/Vector2D.js";

/**
 * Orchestrator class managing simulation state, entity updates, and elastic circle collisions.
 */
export class SpaceEngine {
  /**
   * Creates a SpaceEngine.
   * @param {Object} config - Configuration parameters.
   * @param {number} [config.globalDrag] - Global linear drag coefficient (0 = pure space vacuum).
   * @param {number} [config.restitution] - Elasticity coefficient for collisions (0 = inelastic, 1 = perfectly elastic).
   */
  constructor({ globalDrag = 0, restitution = 0.7 } = {}) {
    this.entities = [];
    this.globalDrag = globalDrag;
    this.restitution = restitution;
  }

  /**
   * Registers a SpaceEntity in the engine.
   * @param {SpaceEntity} entity - The entity to add.
   */
  addEntity(entity) {
    if (!this.entities.find((e) => e.id === entity.id)) {
      this.entities.push(entity);
    }
  }

  /**
   * Removes a SpaceEntity from the engine by its id.
   * @param {string} id - The entity ID to remove.
   * @returns {boolean} True if successfully removed.
   */
  removeEntity(id) {
    const initialLength = this.entities.length;
    this.entities = this.entities.filter((e) => e.id !== id);
    return this.entities.length < initialLength;
  }

  /**
   * Retrieves an entity by its id.
   * @param {string} id - The unique entity ID.
   * @returns {SpaceEntity|undefined} The found entity or undefined.
   */
  getEntity(id) {
    return this.entities.find((e) => e.id === id);
  }

  /**
   * Advances the entire engine simulation by dt seconds.
   * Updates all entities, applies global drag, and resolves active circle-to-circle collisions.
   * @param {number} dt - Time step in seconds.
   */
  update(dt) {
    if (dt <= 0) return;

    // 1. Apply global drag and update each entity's kinematics
    for (const entity of this.entities) {
      if (this.globalDrag > 0 && entity.velocity.magnitude() > 0) {
        // Drag force: F_drag = -c * v
        const dragForce = entity.velocity.multiply(
          -this.globalDrag * entity.mass,
        );
        entity.applyForce(dragForce);
      }
      entity.update(dt);
    }

    // 2. Perform collision detection and resolution
    this.handleCollisions();
  }

  /**
   * Evaluates all unique pairs of entities for overlapping circles.
   * Resolves overlaps via positional correction and calculates momentum-conserving elastic responses.
   */
  handleCollisions() {
    const len = this.entities.length;

    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const e1 = this.entities[i];
        const e2 = this.entities[j];

        const distance = e1.position.distance(e2.position);
        const minDist = e1.radius + e2.radius;

        if (distance < minDist) {
          // A collision has occurred!
          this.resolveCollision(e1, e2, distance, minDist);
        }
      }
    }
  }

  /**
   * Internal helper that handles the physics of a specific collision event.
   * @param {SpaceEntity} e1 - First entity.
   * @param {SpaceEntity} e2 - Second entity.
   * @param {number} distance - Distance between the entities.
   * @param {number} minDist - Sum of their radii.
   */
  resolveCollision(e1, e2, distance, minDist) {
    // Prevent division-by-zero if centers are exactly identical
    const normal =
      distance === 0
        ? new Vector2D(1, 0)
        : e2.position.subtract(e1.position).normalize();

    // --- 1. Positional Correction (De-penetration) ---
    // Pushes overlapping entities apart along the collision normal based on relative mass ratios.
    const overlap = minDist - distance;
    const totalMass = e1.mass + e2.mass;

    if (totalMass > 0) {
      const ratio1 = e2.mass / totalMass;
      const ratio2 = e1.mass / totalMass;

      e1.position = e1.position.subtract(normal.multiply(overlap * ratio1));
      e2.position = e2.position.add(normal.multiply(overlap * ratio2));
    }

    // --- 2. Elastic Impulse Calculation ---
    // Relative velocity vector
    const rv = e2.velocity.subtract(e1.velocity);

    // Relative velocity along the normal vector
    const velAlongNormal = rv.dot(normal);

    // Only resolve if they are moving TOWARDS each other (prevent stickiness)
    if (velAlongNormal < 0) {
      // Calculate impulse scalar: j = -(1 + e) * (v_rel . n) / (1/m1 + 1/m2)
      const impulseScalar =
        (-(1 + this.restitution) * velAlongNormal) /
        (1 / e1.mass + 1 / e2.mass);

      // Apply impulse vector to each entity
      const impulse = normal.multiply(impulseScalar);

      e1.velocity = e1.velocity.subtract(impulse.multiply(1 / e1.mass));
      e2.velocity = e2.velocity.add(impulse.multiply(1 / e2.mass));
    }
  }
}
