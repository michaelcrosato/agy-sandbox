/**
 * GalaxyEventsManager: pure, deterministic class that manages periodic
 * dynamic economic shocks and market events across galactic sectors.
 */
export class GalaxyEventsManager {
  declare activeEvent;
  declare rng;
  /**
   * @param {Object} [config]
   * @param {function} [config.rng] - Custom random generator.
   */
  constructor({ rng = Math.random } = {}) {
    this.rng = rng;
    this.activeEvent = null;
  }

  /**
   * Defined roster of economic events.
   */
  static EVENTS = {
    famine: {
      name: "Famine",
      description: "Severe food shortage! Food prices skyrocketed!",
      duration: 120, // 2 minutes
      priceModifiers: {
        food: 3.0,
        electronics: 0.8,
      },
    },
    harvest_boom: {
      name: "Asteroid Harvest Boom",
      description: "Massive ore discovery! Minerals and ore prices crashed!",
      duration: 120,
      priceModifiers: {
        ore: 0.4,
        minerals: 0.5,
      },
    },
    blockade: {
      name: "Pirate Blockade",
      description: "Pirate blockade in place! Imports are scarce!",
      duration: 120,
      priceModifiers: {
        luxuries: 2.5,
        contraband: 3.0,
        food: 1.8,
      },
    },
    breakthrough: {
      name: "Technological Breakthrough",
      description:
        "Tech breakthrough! Electronics and machinery prices plummeted!",
      duration: 120,
      priceModifiers: {
        electronics: 0.3,
        machinery: 0.5,
      },
    },
  };

  /**
   * Triggers a specific event, or picks one randomly if type is omitted.
   * @param {string|null} [type=null]
   * @param {number|null} [durationOverride=null]
   * @returns {Object} The triggered event.
   */
  triggerEvent(type = null, durationOverride = null) {
    let selectedType = type;
    const types = Object.keys(GalaxyEventsManager.EVENTS);
    if (!selectedType || !GalaxyEventsManager.EVENTS[selectedType]) {
      const idx = Math.floor(this.rng() * types.length);
      selectedType = types[idx];
    }

    const template = GalaxyEventsManager.EVENTS[selectedType];
    this.activeEvent = {
      type: selectedType,
      name: template.name,
      description: template.description,
      duration:
        durationOverride !== null ? durationOverride : template.duration,
      priceModifiers: { ...template.priceModifiers },
    };

    return this.activeEvent;
  }

  /**
   * Clears the current active event.
   */
  clearEvent() {
    this.activeEvent = null;
  }

  /**
   * Ticks down the event duration.
   * @param {number} dt - Elapsed time in seconds.
   * @returns {boolean} True if the active event just expired/ended.
   */
  tick(dt) {
    if (!this.activeEvent) return false;
    this.activeEvent.duration -= dt;
    if (this.activeEvent.duration <= 0) {
      this.activeEvent = null;
      return true;
    }
    return false;
  }

  /**
   * Gets the active price modifier factor for a specific commodity.
   * @param {string} commodity
   * @returns {number} The multiplier factor (default 1.0).
   */
  getPriceModifier(commodity) {
    if (!this.activeEvent || !this.activeEvent.priceModifiers) return 1.0;
    const modifier = this.activeEvent.priceModifiers[commodity];
    return typeof modifier === "number" ? modifier : 1.0;
  }

  /**
   * Serializes the manager state for persistence.
   * @returns {Object}
   */
  serialize() {
    return {
      activeEvent: this.activeEvent ? { ...this.activeEvent } : null,
    };
  }

  /**
   * Restores state from a serialized snapshot.
   * @param {Object} data
   */
  deserialize(data) {
    if (data && data.activeEvent) {
      this.activeEvent = { ...data.activeEvent };
    } else {
      this.activeEvent = null;
    }
  }
}
