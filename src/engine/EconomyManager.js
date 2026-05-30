import { BASE_MARKETS } from "./GameInstance.js";

/** @typedef {import("./Planet.js").Planet} Planet */

/**
 * EconomyManager class that encapsulates dynamic market supply/demand, price elasticity,
 * price normalization, and random economic events across all galactic sectors.
 */
export class EconomyManager {
  /**
   * Creates an EconomyManager.
   * @param {Array<Planet>} planets - List of planets in the game instance.
   */
  constructor(planets = []) {
    this.planets = planets;
    this.activeEconomicEvent = null;
    this.eventDurationTimer = 0; // seconds remaining for current event

    // Elasticity settings per commodity
    this.priceElasticity = {
      food: {
        buyIncrease: 1.022,
        sellDecrease: 0.982,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
      electronics: {
        buyIncrease: 1.022,
        sellDecrease: 0.982,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
      minerals: {
        buyIncrease: 1.022,
        sellDecrease: 0.982,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
      luxuries: {
        buyIncrease: 1.022,
        sellDecrease: 0.982,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
      contraband: {
        buyIncrease: 1.022,
        sellDecrease: 0.982,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
      machinery: {
        buyIncrease: 1.022,
        sellDecrease: 0.982,
        minFactor: 0.4,
        maxFactor: 2.5,
      },
    };
  }

  /**
   * Adjusts commodity prices based on buying action (demand increase).
   * @param {string} planetName - Target planet.
   * @param {string} commodity - Target item.
   * @returns {number|null} The new price or null if invalid.
   */
  registerBuy(planetName, commodity) {
    const planet = this.planets.find((p) => p.name === planetName);
    if (!planet || !planet.market || planet.market[commodity] === undefined)
      return null;

    const base = BASE_MARKETS[planetName];
    if (!base) return null;

    const basePrice = base[commodity] || 150;
    const currentPrice = planet.market[commodity];
    const rules = this.priceElasticity[commodity] || {
      buyIncrease: 1.022,
      minFactor: 0.4,
      maxFactor: 2.5,
    };

    const nextPrice = Math.min(
      Math.round(basePrice * rules.maxFactor),
      Math.round(currentPrice * rules.buyIncrease),
    );
    planet.market[commodity] = nextPrice;
    return nextPrice;
  }

  /**
   * Adjusts commodity prices based on selling action (supply increase).
   * @param {string} planetName - Target planet.
   * @param {string} commodity - Target item.
   * @returns {number|null} The new price or null if invalid.
   */
  registerSell(planetName, commodity) {
    const planet = this.planets.find((p) => p.name === planetName);
    if (!planet || !planet.market || planet.market[commodity] === undefined)
      return null;

    const base = BASE_MARKETS[planetName];
    if (!base) return null;

    const basePrice = base[commodity] || 150;
    const currentPrice = planet.market[commodity];
    const rules = this.priceElasticity[commodity] || {
      sellDecrease: 0.982,
      minFactor: 0.4,
      maxFactor: 2.5,
    };

    const nextPrice = Math.max(
      Math.round(basePrice * rules.minFactor),
      Math.round(currentPrice * rules.sellDecrease),
    );
    planet.market[commodity] = nextPrice;
    return nextPrice;
  }

  /**
   * Normalizes prices back to baseline using a smooth drift.
   * @returns {Array<Planet>} List of planets whose market was updated.
   */
  normalizePrices() {
    const changedPlanets = [];
    for (const p of this.planets) {
      const base = BASE_MARKETS[p.name];
      if (!base) continue;

      let planetChanged = false;
      for (const item of Object.keys(p.market)) {
        if (
          this.activeEconomicEvent &&
          this.activeEconomicEvent.planetName === p.name &&
          this.activeEconomicEvent.commodity === item
        ) {
          continue;
        }

        const current = p.market[item];
        const baseline = base[item];
        // A market may hold a commodity that BASE_MARKETS does not define for
        // this planet (e.g. after a cross-version persistence restore). Drifting
        // toward an `undefined` baseline yields NaN, which permanently poisons
        // the price and then spreads across trade lanes via GalaxyHeartbeat's
        // diffusion. Skip such keys instead of corrupting the galaxy.
        if (!Number.isFinite(baseline)) continue;
        // Self-heal: if a price ever became non-finite (a corrupt restore or an
        // upstream bug), snap it straight back to the finite baseline rather than
        // leaving NaN to linger and spread.
        if (!Number.isFinite(current)) {
          p.market[item] = baseline;
          planetChanged = true;
          continue;
        }
        if (current !== baseline) {
          const diff = baseline - current;
          const step =
            Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.005));
          p.market[item] = current + step;
          planetChanged = true;
        }
      }
      if (planetChanged) {
        changedPlanets.push(p);
      }
    }
    return changedPlanets;
  }

  /**
   * Processes economic tick events and timer advances.
   * @param {number} dt - Time delta in seconds.
   * @returns {Object|null} Status object if event ended.
   */
  updateEvents(dt) {
    if (this.activeEconomicEvent) {
      this.eventDurationTimer -= dt;
      if (this.eventDurationTimer <= 0) {
        const finishedEvent = this.activeEconomicEvent;
        this.clearActiveEvent();
        return { type: "event_ended", event: finishedEvent };
      }
    }
    return null;
  }

  /**
   * Clears the current economic event and restores baseline price.
   */
  clearActiveEvent() {
    if (!this.activeEconomicEvent) return;
    const planet = this.planets.find(
      (p) => p.name === this.activeEconomicEvent.planetName,
    );
    if (planet && BASE_MARKETS[planet.name]) {
      const commodity = this.activeEconomicEvent.commodity;
      const originalPrice = BASE_MARKETS[planet.name][commodity];
      planet.market[commodity] = originalPrice;
    }
    this.activeEconomicEvent = null;
    this.eventDurationTimer = 0;
  }

  /**
   * Triggers a new random dynamic economic event.
   * @param {string} [forcedType] - Optional type to force for testing ("shortage" or "surplus").
   * @returns {Object|null} Details of the triggered event.
   */
  triggerRandomEvent(forcedType = null) {
    this.clearActiveEvent();

    if (this.planets.length === 0) return null;
    const planet =
      this.planets[Math.floor(Math.random() * this.planets.length)];
    if (!planet || !BASE_MARKETS[planet.name]) return null;

    const commodities = Object.keys(BASE_MARKETS[planet.name]);
    if (commodities.length === 0) return null;
    const commodity =
      commodities[Math.floor(Math.random() * commodities.length)];

    const isShortage = forcedType
      ? forcedType === "shortage"
      : Math.random() < 0.5;
    const originalPrice = BASE_MARKETS[planet.name][commodity];

    const multiplier = isShortage ? 1.8 : 0.5;
    const newPrice = Math.round(originalPrice * multiplier);
    planet.market[commodity] = newPrice;

    this.activeEconomicEvent = {
      planetName: planet.name,
      commodity,
      originalPrice,
      newPrice,
      isShortage,
      type: isShortage ? "shortage" : "surplus",
    };

    this.eventDurationTimer = 45; // 45 seconds baseline

    return this.activeEconomicEvent;
  }
}
