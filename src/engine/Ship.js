import { SpaceEntity } from "./SpaceEntity.js";
import { ramscoopRegen } from "./Hyperdrive.js";
import { makeEmptyCargo } from "./commodities.js";

/**
 * Enhanced Ship class representing player and NPC ships with shields, armor, cargo, credits, weapons, and upgrade systems.
 */
export class Ship extends SpaceEntity {
  /**
   * Creates a Ship entity.
   * @param {Object} config - Configuration: `thrustPower`, `brakePower`,
   *   `turnRate`, `maxSpeed`, `maxShield`, `maxArmor`, `shieldRegen`, `credits`,
   *   `cargoCapacity`, `name`, `passengerCapacity`, `faction`, the weapon stats
   *   (`weaponDamage`/`weaponRange`/`weaponSpeed`/`weaponCooldown`), `bountyValue`,
   *   `ramscoopRate`, `miningYieldMultiplier`, plus any baseline `SpaceEntity`
   *   fields (position/velocity/heading/…) collected into `parentParams`.
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
    passengerCapacity = 4,
    name = "Starfarer",
    faction = null,
    weaponDamage = 15,
    weaponRange = 600,
    weaponSpeed = 500,
    weaponCooldown = 0.25,
    bountyValue = null,
    ramscoopRate = 0,
    miningYieldMultiplier = 1,
    outfits = ["Basic Laser"],
    bountyVouchers = [],
    ...parentParams
  } = {}) {
    super({ type: "ship", mass: 2000, radius: 15, ...parentParams });

    this.name = name;
    // Optional faction tag (e.g. "Federation", "Pirates"). When set, the AI
    // can resolve disposition against other faction-tagged ships via a
    // pairwise faction policy; absent or null defaults to legacy name-based
    // behaviour so existing fleets remain unaffected.
    this.faction = faction;
    this.thrustPower = thrustPower;
    this.brakePower = brakePower;
    this.turnRate = turnRate;
    this.maxSpeed = maxSpeed;

    // Hull mass is the bare-ship mass before outfits are installed; outfit
    // mass accumulates on top of it. `this.mass` (used by SpaceEntity physics)
    // is always kept equal to hullMass + outfitMass so that adding heavy
    // outfits naturally lowers acceleration (a = F / m) and turn responsiveness.
    this.hullMass = this.mass;
    this.outfitMass = 0;

    // Health Systems
    this.maxShield = maxShield;
    this.shield = maxShield;
    this.maxArmor = maxArmor;
    this.armor = maxArmor;
    this.shieldRegen = shieldRegen;
    // Combat lockout: shields only recharge after this many seconds without a hit.
    // Fresh ships start "out of combat" so they regenerate immediately.
    this.shieldRegenDelay = 3;
    this.timeSinceLastHit = this.shieldRegenDelay;

    // Energy & Thermal Systems (Endless Sky Modernization)
    this.maxEnergy = 100;
    this.energy = 100;
    this.energyRegen = 50; // units/sec (increased from 20 for fluid firing & thrusting grid)
    this.maxHeat = 100;
    this.heat = 0;
    this.heatDissipation = 10; // units/sec
    this.maxHyperFuel = 100;
    this.hyperFuel = 100;
    // Passive hyperdrive-fuel regen per second (EW3). 0 = no Ramscoop fitted.
    this.ramscoopRate = ramscoopRate;
    // Asteroid-mining yield multiplier (EW9). 1 = stock; a Mining Laser raises it.
    this.miningYieldMultiplier = miningYieldMultiplier;

    // Status states
    this.isOverheated = false;
    this.isDisabled = false;

    // Trading & Economy Systems
    this.credits = credits;
    this.cargoCapacity = cargoCapacity;
    // Passenger berths (EW4) — passenger-charter missions occupy these, not cargo.
    this.passengerCapacity = passengerCapacity;
    this.cargo = makeEmptyCargo();

    // Weapon & Outfit Loadouts
    this.outfits = outfits;
    this.bountyVouchers = bountyVouchers;
    this.weaponDamage = weaponDamage;
    this.weaponRange = weaponRange;
    this.weaponSpeed = weaponSpeed;
    this.weaponCooldown = weaponCooldown;
    // Per-shot costs + shield pierce; overwritten by applyArchetypeToShip. Default
    // to the legacy baseline so an un-archetyped ship still fires correctly.
    this.weaponEnergyCost = 6;
    this.weaponHeatCost = 8;
    this.weaponShieldPierce = 0;
    this.activeWeaponCooldown = 0; // current active countdown

    /** @type {?SpaceEntity} The active combat target selected by this ship. */
    this.target = null;

    // Combat record (EW1). `bountyValue`: explicit credit-worth as a target;
    // null means derive from stats via CombatRating.shipBountyValue. The ledger
    // (kills/combatValue/combatRating) accrues when THIS ship destroys others —
    // the server attributes the kill via entity.destroyedBy and calls
    // CombatRating.recordKill.
    this.bountyValue = bountyValue;
    this.kills = 0;
    this.combatValue = 0;
    this.combatRating = 0;

    // Afterburner: while boosting, thrust and top speed scale up at a steep
    // energy/heat cost.
    this.boostMultiplier = 1.8;

    // Controls state map
    this.controls = {
      isThrusting: false,
      isBraking: false,
      isTurningLeft: false,
      isTurningRight: false,
      isFiring: false,
      isBoosting: false,
    };
    this.isInterdicting = false;
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
    this.controls.isBoosting = false;
  }

  /**
   * Bolts an outfit of the given mass onto the hull. Increases tracked outfit
   * mass and total physical mass, so subsequent acceleration (F / m) and turn
   * responsiveness scale down — heavy builds are tougher but more sluggish.
   * @param {number} delta - Mass to add in kg. Non-positive values are ignored.
   */
  addOutfitMass(delta) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.outfitMass += delta;
    this.mass = this.hullMass + this.outfitMass;
  }

  /**
   * Unbolts an outfit of the given mass from the hull.
   * @param {number} delta - Mass to remove in kg.
   */
  removeOutfitMass(delta) {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.outfitMass = Math.max(0, this.outfitMass - delta);
    this.mass = this.hullMass + this.outfitMass;
  }

  /**
   * Returns the current effective turn rate (rad/s) after mass scaling.
   * A ship at hull mass turns at its base `turnRate`; outfit mass reduces it
   * by the ratio `hullMass / totalMass`, so a doubled-mass ship turns half
   * as fast under the same nominal turn rate.
   * @returns {number} Effective angular speed in radians per second.
   */
  getEffectiveTurnRate() {
    if (this.mass <= 0) return this.turnRate;
    return this.turnRate * (this.hullMass / this.mass);
  }

  /**
   * Applies damage to ship, draining shields first, then structural armor.
   * @param {number} damage - Damage amount.
   * @param {number} [shieldPierce] - Fraction (0..1) of damage that bypasses
   *   shields and strikes armor directly (shield-piercing weapons).
   * @returns {boolean} True if the ship is destroyed (armor <= 0).
   */
  takeDamage(damage, shieldPierce = 0) {
    if (damage <= 0) return this.isDestroyed;

    // Any hit resets the shield-recharge combat lockout.
    this.timeSinceLastHit = 0;

    const pierce = Math.max(0, Math.min(1, shieldPierce));
    const directArmorDamage = damage * pierce;
    const normalDamage = damage - directArmorDamage;

    if (this.shield > 0 && !this.isDisabled) {
      this.shield -= normalDamage;
      if (this.shield < 0) {
        const overflow = Math.abs(this.shield);
        this.shield = 0;
        this.armor -= overflow;
      }
    } else {
      this.armor -= normalDamage;
    }

    if (directArmorDamage > 0) {
      this.armor -= directArmorDamage;
    }

    if (this.armor < 0) {
      this.armor = 0;
    }

    // Disabled ship check - ship enters drifting standby instead of blowing up instantly on 0 armor
    if (this.armor <= 0 && !this.isDisabled) {
      this.isDisabled = true;
      this.armor = 30; // standby structural hull integrity remaining
      this.shield = 0;
      this.clearControls();
      this.isOverheated = false;
      this.heat = 0;
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
   * @param {boolean} _val
   */
  set isDestroyed(_val) {
    // Read-only dynamic property derived from armor
  }

  /**
   * Recharges shields slowly over time if ship is functional, drawing energy and generating heat.
   * @param {number} dt - Time step in seconds.
   */
  regenerateShields(dt) {
    if (this.isDestroyed || this.isDisabled || this.isOverheated) return;
    // Shields stay down for a few seconds after taking a hit (combat lockout).
    if (this.timeSinceLastHit < this.shieldRegenDelay) return;
    if (this.shield < this.maxShield) {
      const shieldDeficit = this.maxShield - this.shield;
      const regenAttempt = Math.min(shieldDeficit, this.shieldRegen * dt);
      const energyCost = regenAttempt * 1.2; // 1.2 energy per 1 shield unit

      if (this.energy >= energyCost) {
        this.energy -= energyCost;
        this.heat = Math.min(
          this.maxHeat * 1.5,
          this.heat + regenAttempt * 0.4,
        );
        this.shield += regenAttempt;
      } else {
        // partial regen if energy is constrained
        const partialRegen = this.energy / 1.2;
        this.energy = 0;
        this.heat = Math.min(
          this.maxHeat * 1.5,
          this.heat + partialRegen * 0.4,
        );
        this.shield += partialRegen;
      }
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
   * Jettisons cargo into space: removes up to `amount` units of `commodity` from
   * the hold and returns a pod spec for the caller to spawn. Dumping more than is
   * carried ejects everything held. Pure aside from mutating own cargo.
   * @param {string} commodity - Cargo type to dump.
   * @param {number} amount - Units to dump; clamped to what is actually carried.
   * @returns {{resourceType: string, amount: number}|null} Pod spec, or null if
   *   the commodity is unknown or nothing could be jettisoned.
   */
  jettison(commodity, amount) {
    if (this.cargo[commodity] === undefined) return null;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const actual = Math.min(Math.floor(amount), this.cargo[commodity]);
    if (actual <= 0) return null;
    this.cargo[commodity] -= actual;
    return { resourceType: commodity, amount: actual };
  }

  /**
   * Overridden update loop. Handles energy generation, thermal meltdown thresholds, regeneration, cooling, and propulsion controls.
   * @param {number} dt - Frame time step in seconds.
   */
  update(dt) {
    if (dt <= 0 || this.isDestroyed) return;

    if (this.isDisabled) {
      // Disabled ships drift helplessly, slowly cooling down and losing active power
      this.shield = 0;
      this.energy = 0;
      this.heat = Math.max(0, this.heat - this.heatDissipation * dt);
      this.clearControls();
      this.angularVelocity = 0;
      super.update(dt);
      return;
    }

    // Advance the combat-lockout timer that gates shield regeneration.
    this.timeSinceLastHit += dt;

    // 1. Recharge energy reserves
    this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen * dt);

    // 2. Dissipate excess thermal buildup
    this.heat = Math.max(0, this.heat - this.heatDissipation * dt);

    // Passive hyperdrive-fuel regeneration (Ramscoop; no-op at rate 0).
    ramscoopRegen(this, dt, this.ramscoopRate);

    // 3. Reactor Melt-down checking
    if (this.heat >= this.maxHeat) {
      this.isOverheated = true;
    }
    if (this.isOverheated) {
      // Core overheat decays structural armor
      this.armor = Math.max(1, this.armor - 4 * dt); // slow meltdown decay
      if (this.heat < 50) {
        this.isOverheated = false; // cooled down
      }
    }

    // Slow shield regeneration
    this.regenerateShields(dt);

    // Reduce weapon cooling
    if (this.activeWeaponCooldown > 0) {
      this.activeWeaponCooldown = Math.max(0, this.activeWeaponCooldown - dt);
    }

    // --- Rotational Control Integration ---
    // Outfit mass slows the ship down rotationally (mass scaling), the same
    // way it slows down linear acceleration via F / m on the linear axis.
    const effectiveTurnRate = this.getEffectiveTurnRate();
    if (this.controls.isTurningLeft && !this.controls.isTurningRight) {
      this.angularVelocity = -effectiveTurnRate;
    } else if (this.controls.isTurningRight && !this.controls.isTurningLeft) {
      this.angularVelocity = effectiveTurnRate;
    } else {
      this.angularVelocity = 0;
    }

    // --- Linear Propulsion Control Integration ---
    if (this.controls.isThrusting && !this.isOverheated) {
      const boosting = this.controls.isBoosting && this.energy > 0;
      const thrustEnergyCost = (boosting ? 45 : 15) * dt;
      if (this.energy >= thrustEnergyCost) {
        this.energy -= thrustEnergyCost;
        this.heat = Math.min(
          this.maxHeat * 1.5,
          this.heat + (boosting ? 20 : 8) * dt,
        );

        const direction = this.getDirectionVector();
        const multiplier = boosting ? this.boostMultiplier : 1;
        const thrustForce = direction.multiply(this.thrustPower * multiplier);
        this.applyForce(thrustForce);
      }
    }

    // --- Retro-Brake Propulsion Control Integration ---
    if (this.controls.isBraking && !this.isOverheated) {
      const brakeEnergyCost = 10 * dt;
      if (this.energy >= brakeEnergyCost) {
        this.energy -= brakeEnergyCost;
        this.heat = Math.min(this.maxHeat * 1.5, this.heat + 5 * dt);

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
    }

    // Advance physical kinematics
    super.update(dt);

    // Apply terminal speed limit cap
    const currentSpeed = this.velocity.magnitude();
    let speedCap = this.maxSpeed;
    if (this.isOverheated) {
      speedCap *= 0.5; // nerf max speed by 50% during reactor meltdown
    } else if (this.controls.isBoosting && this.controls.isThrusting) {
      speedCap *= this.boostMultiplier; // afterburner raises the speed ceiling
    }
    if (currentSpeed > speedCap) {
      this.velocity = this.velocity.normalize().multiply(speedCap);
    }
  }

  /**
   * Returns whether the ship has an active hyperdrive interdictor field.
   * @returns {boolean}
   */
  hasActiveInterdictor() {
    if (this.isDestroyed) return false;
    if (
      this.outfits &&
      this.outfits.includes("Hyperdrive Interdictor Matrix")
    ) {
      return true;
    }
    return !!this.isInterdicting;
  }
}
