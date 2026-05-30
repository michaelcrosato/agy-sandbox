import { SpaceEntity } from "./SpaceEntity.js";
import { DEFAULT_OUTFITS } from "./outfitCatalog.js";

/**
 * Planet class representing static celestial hubs with markets, outfitters, and shipyards.
 */
export class Planet extends SpaceEntity {
  /**
   * Creates a Planet.
   * @param {Object} config - Configuration: `name`, optional `description`, `color`,
   *   `market` (commodity price map), `outfitter`, `shipyard`, `landingRadius`,
   *   `sector`, `faction`, `services`, plus any baseline `SpaceEntity` fields
   *   (position/velocity/radius/mass/…) collected into `parentParams`.
   */
  constructor({
    name,
    description = "A thriving hub in the frontier sector.",
    color = "#4d6fff", // baseline atmospheric color
    market = {},
    outfitter = [],
    shipyard = [],
    landingRadius,
    sector = null,
    faction = null,
    services = { repair: true, refuel: true },
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
    this.sector = sector;
    // Controlling faction (spec 016) — drives faction pricing + docking rights.
    this.faction = faction;
    // Port services offered here (EW5): hull repair and hyperdrive refuel.
    this.services = services;

    // Commodity Market Values (prices fluctuate per planet!)
    this.market = {
      food: market.food || 100,
      electronics: market.electronics || 300,
      minerals: market.minerals || 150,
      luxuries: market.luxuries || 500,
      contraband: market.contraband || 250,
      machinery: market.machinery || 200,
      // ore (spec 018): raw mining output that refines into minerals.
      ore: market.ore || 80,
    };

    // Store Outfitter Catalog
    // Each outfit carries an optional `mass` (kg). Heavy shields and bulk
    // cargo holds add a lot of mass; reactors/weapons are moderate; engines
    // and small modules are light. The server bolts that mass onto the ship
    // on purchase so a heavily-outfitted hull is tougher but more sluggish
    // (acceleration F / m and turn rate scale inversely with total mass).
    this.outfitter = outfitter.length > 0 ? outfitter : DEFAULT_OUTFITS;

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
            {
              name: "Interceptor",
              cost: 22000,
              thrustPower: 20000,
              turnRate: 3.6,
              maxShield: 280,
              maxArmor: 150,
              cargoCapacity: 6,
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
