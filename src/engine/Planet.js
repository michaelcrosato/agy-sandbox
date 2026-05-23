import { SpaceEntity } from "./SpaceEntity.js";

/**
 * Planet class representing static celestial hubs with markets, outfitters, and shipyards.
 */
export class Planet extends SpaceEntity {
  /**
   * Creates a Planet.
   * @param {Object} config - Configuration parameters.
   * @param {string} config.name - Planet name.
   * @param {string} [config.description] - Flavor lore/text.
   * @param {Object} [config.market] - Buy/sell commodity price map (default prices: food: 100, electronics: 300, minerals: 150).
   * @param {Array} [config.outfitter] - List of upgrades available to buy.
   * @param {Array} [config.shipyard] - List of ships available to buy.
   * @param {number} [config.landingRadius] - Trigger distance for landing (default radius + 40).
   * @param {Object} [config.parentParams] - Remaining baseline entity properties.
   */
  constructor({
    name,
    description = "A thriving hub in the frontier sector.",
    color = "#4d6fff", // baseline atmospheric color
    market = {},
    outfitter = [],
    shipyard = [],
    landingRadius,
    ...parentParams
  }) {
    // Planets are static, high-radius, high-mass entities
    super({
      type: "planet",
      mass: 1e12, // infinite relative mass
      radius: 60,
      ...parentParams,
    });

    this.name = name;
    this.description = description;
    this.color = color;

    // Commodity Market Values (prices fluctuate per planet!)
    this.market = {
      food: market.food || 100,
      electronics: market.electronics || 300,
      minerals: market.minerals || 150,
      luxuries: market.luxuries || 500,
      contraband: market.contraband || 250,
      machinery: market.machinery || 200,
    };

    // Store Outfitter Catalog
    this.outfitter =
      outfitter.length > 0
        ? outfitter
        : [
            { name: "Heavy Shields", cost: 1200, type: "shield", value: 350 },
            {
              name: "Aegis Shield Matrix",
              cost: 4500,
              type: "shield",
              value: 800,
            },
            {
              name: "Overcharged Engines",
              cost: 1500,
              type: "engine",
              value: 12000,
            },
            {
              name: "Hyper-Drive Thrusters",
              cost: 3800,
              type: "engine",
              value: 25000,
            },
            { name: "Plasma Cannon", cost: 1800, type: "weapon", value: 25 },
            { name: "Neutron Blaster", cost: 4200, type: "weapon", value: 55 },
            {
              name: "Expanded Cargo Holds",
              cost: 1000,
              type: "cargo",
              value: 15,
            },
            {
              name: "Sub-space Cargo Compressor",
              cost: 2800,
              type: "cargo",
              value: 45,
            },
            {
              name: "Tractor Beam Matrix",
              cost: 2500,
              type: "tractor",
              value: 250,
              description: "Emits a high-frequency gravimetric tether that automatically pulls floating cargo pods within 250u towards the ship's bay."
            },
            {
              name: "Cold-Fusion Reactor",
              cost: 3000,
              type: "reactor",
              value: 30,
              description: "Deep-space cold-fusion energy generator. Restores ship energy by +30 units/sec."
            },
            {
              name: "Cryo-Cooling Radiator",
              cost: 2200,
              type: "radiator",
              value: 15,
              description: "Super-conductive helium radiator. Boosts heat dissipation by +15 units/sec."
            },
            {
              name: "Supercapacitor Cells",
              cost: 1600,
              type: "capacitor",
              value: 100,
              description: "Nanotech storage bank cells. Increases max energy capacity by +100 units."
            }
          ];

    // Store Shipyard Catalog
    this.shipyard =
      shipyard.length > 0
        ? shipyard
        : [
            {
              name: "Shuttle",
              cost: 5000,
              thrustPower: 8000,
              turnRate: 2.8,
              maxShield: 150,
              maxArmor: 80,
              cargoCapacity: 15,
            },
            {
              name: "Courier",
              cost: 10000,
              thrustPower: 12000,
              turnRate: 3.4,
              maxShield: 200,
              maxArmor: 100,
              cargoCapacity: 10,
            },
            {
              name: "Cargo Hauler",
              cost: 18000,
              thrustPower: 11000,
              turnRate: 1.5,
              maxShield: 300,
              maxArmor: 200,
              cargoCapacity: 80,
            },
            {
              name: "Heavy Freighter",
              cost: 35000,
              thrustPower: 16000,
              turnRate: 1.2,
              maxShield: 500,
              maxArmor: 350,
              cargoCapacity: 200,
            },
            {
              name: "Star Fighter",
              cost: 28000,
              thrustPower: 18000,
              turnRate: 3.2,
              maxShield: 400,
              maxArmor: 250,
              cargoCapacity: 8,
            },
            {
              name: "Military Destroyer",
              cost: 65000,
              thrustPower: 26000,
              turnRate: 1.6,
              maxShield: 900,
              maxArmor: 600,
              cargoCapacity: 30,
            },
          ];

    this.landingRadius = landingRadius || this.radius + 40;
  }

  /**
   * Evaluates if a ship is in suitable proximity and low enough speed to land.
   * @param {SpaceEntity} ship - The ship attempting to land.
   * @returns {boolean} True if landing is permitted.
   */
  canLand(ship) {
    const dist = this.position.distance(ship.position);
    const speed = ship.velocity.magnitude();
    // Must be within landing trigger distance and traveling below 80 speed units/sec
    return dist <= this.landingRadius && speed <= 80;
  }
}
