import { SpaceEntity } from "./SpaceEntity.js";

/**
 * Enhanced Ship class representing player and NPC ships with shields, armor, cargo, credits, weapons, and upgrade systems.
 */
export class Ship extends SpaceEntity {
  /**
   * Creates a Ship entity.
   * @param {Object} config - Configuration parameters.
   * @param {number} [config.thrustPower] - Forward propulsion force in Newtons.
   * @param {number} [config.brakePower] - Retro-propulsion force in Newtons.
   * @param {number} [config.turnRate] - Turning speed in radians/second.
   * @param {number} [config.maxSpeed] - Speed cap in units/second.
   * @param {number} [config.maxShield] - Maximum shield health capacity.
   * @param {number} [config.maxArmor] - Maximum structural armor capacity.
   * @param {number} [config.shieldRegen] - Shield regeneration rate per second.
   * @param {number} [config.credits] - Currency amount for trading.
   * @param {number} [config.cargoCapacity] - Max weight of cargo units.
   * @param {string} [config.name] - Readable identifier for UI display.
   * @param {Object} [config.parentParams] - Remaining baseline entity properties.
   */
  constructor({
    thrustPower = 8000,
    brakePower = 4000,
    turnRate = 2.5,
    maxSpeed = 300,
    maxShield = 200,
    maxArmor = 100,
    shieldRegen = 10,
    credits = 5000,
    cargoCapacity = 20,
    name = "Starfarer",
    ...parentParams
  } = {}) {
    super({ type: "ship", mass: 2000, radius: 15, ...parentParams });

    this.name = name;
    this.thrustPower = thrustPower;
    this.brakePower = brakePower;
    this.turnRate = turnRate;
    this.maxSpeed = maxSpeed;

    // Health Systems
    this.maxShield = maxShield;
    this.shield = maxShield;
    this.maxArmor = maxArmor;
    this.armor = maxArmor;
    this.shieldRegen = shieldRegen;

    // Trading & Economy Systems
    this.credits = credits;
    this.cargoCapacity = cargoCapacity;
    this.cargo = {
      food: 0,
      electronics: 0,
      minerals: 0,
      luxuries: 0,
      contraband: 0,
      machinery: 0,
    };

    // Weapon & Outfit Loadouts
    this.outfits = ["Basic Laser"];
    this.weaponDamage = 15;
    this.weaponRange = 600; // in pixels/units
    this.weaponSpeed = 500; // projectile velocity
    this.weaponCooldown = 0.25; // seconds between fires
    this.activeWeaponCooldown = 0; // current active countdown

    // Controls state map
    this.controls = {
      isThrusting: false,
      isBraking: false,
      isTurningLeft: false,
      isTurningRight: false,
      isFiring: false,
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
    this.controls.isFiring = false;
  }

  /**
   * Applies damage to ship, draining shields first, then structural armor.
   * @param {number} damage - Damage amount.
   * @returns {boolean} True if the ship is destroyed (armor <= 0).
   */
  takeDamage(damage) {
    if (damage <= 0) return this.isDestroyed;

    if (this.shield > 0) {
      this.shield -= damage;
      if (this.shield < 0) {
        const overflow = Math.abs(this.shield);
        this.shield = 0;
        this.armor -= overflow;
      }
    } else {
      this.armor -= damage;
    }

    if (this.armor < 0) {
      this.armor = 0;
    }

    return this.isDestroyed;
  }

  /**
   * Retrieves whether structural armor has failed completely.
   * @returns {boolean} True if destroyed.
   */
  get isDestroyed() {
    return this.armor <= 0;
  }

  /**
   * Recharges shields slowly over time if ship is functional.
   * @param {number} dt - Time step in seconds.
   */
  regenerateShields(dt) {
    if (this.isDestroyed) return;
    if (this.shield < this.maxShield) {
      this.shield = Math.min(
        this.maxShield,
        this.shield + this.shieldRegen * dt,
      );
    }
  }

  /**
   * Retrieves the current cargo load weight.
   * @returns {number} Sum of all cargo items.
   */
  getCargoWeight() {
    return Object.values(this.cargo).reduce((a, b) => a + b, 0);
  }

  /**
   * Attempts to add items to cargo bay.
   * @param {string} commodity - Cargo commodity type.
   * @param {number} amount - Amount to load.
   * @returns {boolean} True if loaded successfully.
   */
  addCargo(commodity, amount) {
    if (this.getCargoWeight() + amount > this.cargoCapacity) {
      return false; // Cargo full
    }
    if (this.cargo[commodity] !== undefined) {
      this.cargo[commodity] += amount;
      return true;
    }
    return false;
  }

  /**
   * Attempts to remove items from cargo bay.
   * @param {string} commodity - Cargo commodity type.
   * @param {number} amount - Amount to unload.
   * @returns {boolean} True if unloaded successfully.
   */
  removeCargo(commodity, amount) {
    if (
      this.cargo[commodity] !== undefined &&
      this.cargo[commodity] >= amount
    ) {
      this.cargo[commodity] -= amount;
      return true;
    }
    return false;
  }

  /**
   * Overridden update loop. Handles regeneration, cooldowns, and propulsion controls.
   * @param {number} dt - Frame time step in seconds.
   */
  update(dt) {
    if (dt <= 0 || this.isDestroyed) return;

    // Slow shield regeneration
    this.regenerateShields(dt);

    // Reduce weapon cooling
    if (this.activeWeaponCooldown > 0) {
      this.activeWeaponCooldown = Math.max(0, this.activeWeaponCooldown - dt);
    }

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
      const direction = this.getDirectionVector();
      const thrustForce = direction.multiply(this.thrustPower);
      this.applyForce(thrustForce);
    }

    // --- Retro-Brake Propulsion Control Integration ---
    if (this.controls.isBraking) {
      const speed = this.velocity.magnitude();
      if (speed > 0.01) {
        const brakeDirection = this.velocity.normalize().multiply(-1);
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

    // Apply terminal speed limit cap
    const currentSpeed = this.velocity.magnitude();
    if (currentSpeed > this.maxSpeed) {
      this.velocity = this.velocity.normalize().multiply(this.maxSpeed);
    }
  }
}
