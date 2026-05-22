import { Vector2D } from "../physics/Vector2D.js";
import { Projectile } from "./Projectile.js";

/**
 * Orchestrator class managing simulation state, entity updates, weapon fires, and circular elastic collisions.
 */
export class SpaceEngine {
  /**
   * Creates a SpaceEngine.
   * @param {Object} config - Configuration parameters.
   * @param {number} [config.globalDrag] - Global linear drag coefficient (0 = pure space vacuum).
   * @param {number} [config.restitution] - Elasticity coefficient for collisions (0 = inelastic, 1 = perfectly elastic).
   */
  constructor({ globalDrag = 0, restitution = 0.5 } = {}) {
    this.entities = [];
    this.globalDrag = globalDrag;
    this.restitution = restitution;

    // Hook listeners for explosions or special events
    this.onEntityDestroyed = null;
    this.onProjectileFired = null;
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
   * Handles weapon fires, kinematic updates, expired entities, and collision resolution.
   * @param {number} dt - Time step in seconds.
   */
  update(dt) {
    if (dt <= 0) return;

    // 1. Process active weapon fire intents
    for (const entity of this.entities) {
      if (entity.type === "ship" && !entity.isDestroyed) {
        if (entity.controls.isFiring && entity.activeWeaponCooldown === 0) {
          this.fireWeapon(entity);
        }
      }
    }

    // 2. Apply global drag and update all entities
    for (const entity of this.entities) {
      if (
        this.globalDrag > 0 &&
        entity.type === "ship" &&
        entity.velocity.magnitude() > 0
      ) {
        const dragForce = entity.velocity.multiply(
          -this.globalDrag * entity.mass,
        );
        entity.applyForce(dragForce);
      }
      entity.update(dt);
    }

    // 3. Remove expired projectiles and destroyed entities
    this.cleanupEntities();

    // 4. Perform collision detection and resolution
    this.handleCollisions();
  }

  /**
   * Generates a projectile from a firing ship and sets its cooldown.
   * @param {Ship} ship - The ship firing its weapon.
   */
  fireWeapon(ship) {
    // Position projectile slightly in front of the ship to avoid firing inside self
    const dir = ship.getDirectionVector();
    const spawnPos = ship.position.add(dir.multiply(ship.radius + 5));

    const proj = new Projectile({
      ownerId: ship.id,
      damage: ship.weaponDamage,
      speed: ship.weaponSpeed,
      range: ship.weaponRange,
      startPosition: spawnPos,
      heading: ship.heading,
      ownerVelocity: ship.velocity,
    });

    this.addEntity(proj);
    ship.activeWeaponCooldown = ship.weaponCooldown;

    if (this.onProjectileFired) {
      this.onProjectileFired(proj, ship);
    }
  }

  /**
   * Filters out inactive or destroyed elements (expired lasers, dead ships).
   */
  cleanupEntities() {
    const activeEntities = [];

    for (const ent of this.entities) {
      if (ent.type === "projectile" && ent.isExpired) {
        continue; // drop expired laser bolts
      }

      if (ent.type === "ship" && ent.isDestroyed) {
        // Trigger destruction event
        if (this.onEntityDestroyed) {
          this.onEntityDestroyed(ent);
        }
        continue; // drop exploded ships
      }

      if (
        (ent.type === "generic" || ent.type === "gem_asteroid") &&
        ent.mass <= 0
      ) {
        // Trigger destruction event for asteroids
        if (this.onEntityDestroyed) {
          this.onEntityDestroyed(ent);
        }
        continue; // drop broken asteroids
      }

      activeEntities.push(ent);
    }

    this.entities = activeEntities;
  }

  /**
   * Evaluates all unique pairs of entities for overlapping circles.
   * Resolves physical impacts or applies projectile damage.
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
          // Collision occurred!
          if (e1.type === "projectile" || e2.type === "projectile") {
            this.resolveProjectileCollision(e1, e2);
          } else {
            this.resolveCollision(e1, e2, distance, minDist);
          }
        }
      }
    }
  }

  /**
   * Processes impact of weapon discharges on ships or asteroids.
   */
  resolveProjectileCollision(e1, e2) {
    const proj = e1.type === "projectile" ? e1 : e2;
    const target = e1.type === "projectile" ? e2 : e1;

    // Projectile can't hit its own launcher or other projectiles or static planets
    if (
      target.id === proj.ownerId ||
      target.type === "projectile" ||
      target.type === "planet"
    ) {
      return;
    }

    // Apply damage to target
    if (target.type === "ship") {
      target.takeDamage(proj.damage);
      if (target.isDestroyed) {
        target.destroyedBy = proj.ownerId;
      }
    } else if (target.type === "generic" || target.type === "gem_asteroid") {
      // Asteroids/Generic debris simply take damage or disappear
      target.mass = 0; // mark for deletion in next tick or update loop
      target.destroyedBy = proj.ownerId;
    }

    // Expire the projectile immediately upon impact
    proj.lifetime = 0;
  }

  /**
   * Resolves physical circle overlap and elastic rebound.
   */
  resolveCollision(e1, e2, distance, minDist) {
    // Static objects (like planets) don't recoil or shift
    const totalMass = e1.mass + e2.mass;
    if (totalMass === 0) return;

    const normal =
      distance === 0
        ? new Vector2D(1, 0)
        : e2.position.subtract(e1.position).normalize();

    // --- 1. Positional Correction (De-penetration) ---
    const overlap = minDist - distance;

    const isE1Static = e1.type === "planet";
    const isE2Static = e2.type === "planet";

    if (isE1Static && !isE2Static) {
      e2.position = e2.position.add(normal.multiply(overlap));
    } else if (isE2Static && !isE1Static) {
      e1.position = e1.position.subtract(normal.multiply(overlap));
    } else if (!isE1Static && !isE2Static) {
      const ratio1 = e2.mass / totalMass;
      const ratio2 = e1.mass / totalMass;
      e1.position = e1.position.subtract(normal.multiply(overlap * ratio1));
      e2.position = e2.position.add(normal.multiply(overlap * ratio2));
    }

    // --- 2. Elastic Impulse Calculation ---
    const rv = e2.velocity.subtract(e1.velocity);
    const velAlongNormal = rv.dot(normal);

    // Only rebound if moving towards each other
    if (velAlongNormal < 0) {
      // Static objects have infinite mass in kinetic formulas
      const invMass1 = isE1Static ? 0 : 1 / e1.mass;
      const invMass2 = isE2Static ? 0 : 1 / e2.mass;
      const massFactor = invMass1 + invMass2;

      if (massFactor > 0) {
        const impulseScalar =
          (-(1 + this.restitution) * velAlongNormal) / massFactor;
        const impulse = normal.multiply(impulseScalar);

        if (!isE1Static)
          e1.velocity = e1.velocity.subtract(impulse.multiply(invMass1));
        if (!isE2Static)
          e2.velocity = e2.velocity.add(impulse.multiply(invMass2));
      }
    }
  }
}
