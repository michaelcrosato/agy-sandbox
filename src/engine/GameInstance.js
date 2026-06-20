/**
 * GameInstance coordinates sector engine simulations, warp portals, entities, and room states.
 */
import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "./Ship.js";
import { Planet } from "./Planet.js";
import { SpaceEngine } from "./SpaceEngine.js";
import { TerritoryControl } from "./TerritoryControl.js";
import { SpaceEntity } from "./SpaceEntity.js";
import { AIController } from "./ai/AIController.js";
import { DEFAULT_OUTFITS } from "./outfitCatalog.js";
import { CargoPod } from "./CargoPod.js";
import { CosmicStorm } from "./CosmicStorm.js";
import { EconomyManager } from "./EconomyManager.js";
import { GalaxyEventsManager } from "./GalaxyEventsManager.js";
import { FactionRegistry } from "./FactionRegistry.js";
import { GalaxyHeartbeat } from "./GalaxyHeartbeat.js";
import { DeterminismSentry } from "./DeterminismSentry.js";
import { PLANET_PROFILES } from "./ProductionModel.js";
import { recordKill, shipBountyValue } from "./CombatRating.js";
import { mineYield } from "./Mining.js";
import { shipName, createSeededRng } from "./NameGenerator.js";
import { squadManager } from "../server/SquadManager.js";
import { SandboxSecurityRegistry } from "../net/SandboxSecurityRegistry.js";
import { FactionWarCampaign } from "./FactionWarCampaign.js";

/**
 * Map defining which sectors share direct warp-gate trade route adjacency links.
 * Used for simulated economic and price diffusion.
 * @type {Record<string, Array<string>>}
 */
export const SECTOR_ADJACENCY = {
  core: ["frontier"],
  frontier: ["core", "rim"],
  rim: ["frontier"],
};

import { BASE_MARKETS } from "../net/SchemaRegistry.js";
export { BASE_MARKETS };

/**
 * Utility helper to identify a sector ID from 2D vector coordinate bounds.
 * @param {object} pos Coordinate point containing x and y coordinates.
 * @returns {string} The sector name identifier.
 */
export function getSectorFromPosition(pos) {
  if (!pos) return "core";
  if (pos.x > 10000 && pos.y > 10000) return "frontier";
  if (pos.x < -10000 && pos.y < -10000) return "rim";
  return "core";
}

/**
 * Authoritative sandbox game instance simulator managing sectors, entities,
 * economies, and dynamic galactic factions.
 */
export class GameInstance {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    // Matchmaking metadata (spec 036); overridable per room before/at creation.
    this.mode = "standard";
    this.maxPlayers = 50;
    /** @type {Array<string>} */
    this.tags = [];
    this.engine = new SpaceEngine({ globalDrag: 0.1, restitution: 0.4 });
    this.planets = [];
    this.cosmicStorms = [];
    this.ais = [];
    this.fleets = new Map(); // fleetName -> Set<clientObj>
    this.clients = new Map(); // ws -> clientObj
    this.activeEconomicEvent = null;
    this.activeSectorEvent = null;
    this.lastActiveTime = Date.now();
    this.pendingTimers = new Set();
    this.isConflictZone = false;
    this.conflictFactionA = null;
    this.conflictFactionB = null;
    this.galaxyEventsManager = new GalaxyEventsManager();
    this.chronicle = null;
    this.determinismSentry = new DeterminismSentry();

    // Set up engine event handlers
    this.engine.onProjectileFired = (proj, ship) => {
      this.broadcast({
        type: "projectile_fired",
        x: ship.position.x,
        y: ship.position.y,
        heading: ship.heading,
        radius: ship.radius,
        ownerId: ship.id,
      });
    };

    this.engine.onEntityDestroyed = (ent) => {
      // Pass a global sessions reference which we retrieve from the clients map or externally
      this.handleEntityDestroyed(ent);
    };

    // Per-player faction standings + pairwise relations (spec 016). Created
    // before seedGalaxy so NPC spawns can hand their controllers the policy
    // views (faction relations + per-player standings) for disposition targeting.
    this.factionRegistry = new FactionRegistry();
    this.baseMarkets = { ...BASE_MARKETS };

    this.territoryControl = new TerritoryControl();
    this.factionRegistry.territoryControl = this.territoryControl;
    this.territoryControl.onControlShift = (sectorId, oldOwner, newOwner) => {
      this.handleControlShift(sectorId, oldOwner, newOwner);
    };

    // Seed initial entities
    this.seedGalaxy();

    // Assign each seeded planet a controlling faction (static config).
    this.assignPlanetFactions();

    // Initialize the dynamic economy manager
    this.economyManager = new EconomyManager(this.planets);

    // Initialize Faction War Campaign engine
    this.factionWarCampaign = new FactionWarCampaign();

    // The galaxy heartbeat ages the economy even with no players connected:
    // first applying each planet's producer/consumer profile (surplus pushes
    // its commodities down, demand pushes consumed ones up) and then
    // diffusing prices along trade lanes between sectors.
    this.galaxyHeartbeat = new GalaxyHeartbeat({
      planets: this.planets,
      baseMarkets: BASE_MARKETS,
      lanes: GalaxyHeartbeat.buildLanesBySector(this.planets, SECTOR_ADJACENCY),
      profiles: PLANET_PROFILES,
    });
  }

  seedGalaxy() {
    // 1. Core Sector
    const solPlanet = new Planet({
      name: "Sol",
      description:
        "The historic cradle of humanity and bustling trade center of the inner systems. High luxury demand, cheap machinery.",
      color: "#4d6fff",
      position: new Vector2D(0, 0),
      radius: 65,
      market: { ...BASE_MARKETS["Sol"] },
      sector: "core",
    });
    this.planets.push(solPlanet);
    this.engine.addEntity(solPlanet);

    const valkyriePlanet = new Planet({
      name: "Valkyrie Depot",
      description:
        "Core fleet military staging area. Produces high-grade heavy machinery, demands electronics.",
      color: "#ff1744",
      position: new Vector2D(2000, 500),
      radius: 62,
      market: { ...BASE_MARKETS["Valkyrie Depot"] },
      sector: "core",
      services: { repair: true, refuel: true, refinery: true },
    });
    this.planets.push(valkyriePlanet);
    this.engine.addEntity(valkyriePlanet);

    // 2. Frontier Systems Sector (Offset X:+20000, Y:+20000)
    const polarisPlanet = new Planet({
      name: "New Polaris",
      description:
        "An icy frontier industrial colony rich in raw mineral extractions. High food demand, cheap raw minerals.",
      color: "#e0f7fa",
      position: new Vector2D(22000, 18800),
      radius: 55,
      market: { ...BASE_MARKETS["New Polaris"] },
      sector: "frontier",
      services: { repair: true, refuel: true, refinery: true },
    });
    this.planets.push(polarisPlanet);
    this.engine.addEntity(polarisPlanet);

    const draconisPlanet = new Planet({
      name: "Sigma Draconis",
      description:
        "A high-tech research outpost specializing in advanced electronics production. Demands minerals, cheap electronics.",
      color: "#00f2fe",
      position: new Vector2D(17800, 21600),
      radius: 60,
      market: { ...BASE_MARKETS["Sigma Draconis"] },
      sector: "frontier",
      services: { repair: true, refuel: true, refinery: true },
    });
    this.planets.push(draconisPlanet);
    this.engine.addEntity(draconisPlanet);

    const aureliaPlanet = new Planet({
      name: "Aurelia Mining Hub",
      description:
        "Outer planetary asteroid refinery. Demands food, produces cheap raw metals and machinery.",
      color: "#ff9100",
      position: new Vector2D(21800, 21800),
      radius: 58,
      market: { ...BASE_MARKETS["Aurelia Mining Hub"] },
      sector: "frontier",
      services: { repair: true, refuel: true, refinery: true },
    });
    this.planets.push(aureliaPlanet);
    this.engine.addEntity(aureliaPlanet);

    // 3. Outer Lawless Rim Sector (Offset X:-20000, Y:-20000)
    const kaelisPlanet = new Planet({
      name: "Kaelis Colony",
      description:
        "An agricultural breadbasket producing vast food supplies. Demands electronics, cheap food.",
      color: "#00e676",
      position: new Vector2D(-21800, -21800),
      radius: 60,
      market: { ...BASE_MARKETS["Kaelis Colony"] },
      sector: "rim",
    });
    this.planets.push(kaelisPlanet);
    this.engine.addEntity(kaelisPlanet);

    const tenebrisPlanet = new Planet({
      name: "Tenebris Prime",
      description:
        "A mysterious colony inside a dark nebula. Produces top-tier scientific luxuries, demands electronics.",
      color: "#d500f9",
      position: new Vector2D(-20600, -17600),
      radius: 55,
      market: { ...BASE_MARKETS["Tenebris Prime"] },
      sector: "rim",
    });
    this.planets.push(tenebrisPlanet);
    this.engine.addEntity(tenebrisPlanet);

    const roguesPlanet = new Planet({
      name: "Rogue's Hollow",
      description:
        "A lawless pirate anchorage hidden deep inside a dense asteroid field. Smuggler contraband is cheap here.",
      color: "#e040fb",
      position: new Vector2D(-22800, -20500),
      radius: 52,
      market: { ...BASE_MARKETS["Rogue's Hollow"] },
      sector: "rim",
      services: { repair: true, refuel: true, blackMarket: true },
    });
    this.planets.push(roguesPlanet);
    this.engine.addEntity(roguesPlanet);

    // 4. Hyperlane Warp Stargates Seeding (Endless Sky Navigation)
    /** @type {any} */
    const gateCoreToFrontier = new SpaceEntity({
      id: "gate-core-to-frontier",
      type: "warp_gate",
      position: new Vector2D(3500, 0),
      radius: 45,
      heading: 0,
    });
    gateCoreToFrontier.name = "Frontier Stargate";
    gateCoreToFrontier.sector = "core";
    gateCoreToFrontier.targetSector = "frontier";
    gateCoreToFrontier.targetPosition = new Vector2D(17200, 20000);
    this.engine.addEntity(gateCoreToFrontier);

    /** @type {any} */
    const gateFrontierToCore = new SpaceEntity({
      id: "gate-frontier-to-core",
      type: "warp_gate",
      position: new Vector2D(17000, 20000),
      radius: 45,
      heading: 0,
    });
    gateFrontierToCore.name = "Core Stargate";
    gateFrontierToCore.sector = "frontier";
    gateFrontierToCore.targetSector = "core";
    gateFrontierToCore.targetPosition = new Vector2D(3300, 0);
    this.engine.addEntity(gateFrontierToCore);

    /** @type {any} */
    const gateFrontierToRim = new SpaceEntity({
      id: "gate-frontier-to-rim",
      type: "warp_gate",
      position: new Vector2D(23000, 20000),
      radius: 45,
      heading: 0,
    });
    gateFrontierToRim.name = "Outer Rim Stargate";
    gateFrontierToRim.sector = "frontier";
    gateFrontierToRim.targetSector = "rim";
    gateFrontierToRim.targetPosition = new Vector2D(-17200, -20000);
    this.engine.addEntity(gateFrontierToRim);

    /** @type {any} */
    const gateRimToFrontier = new SpaceEntity({
      id: "gate-rim-to-frontier",
      type: "warp_gate",
      position: new Vector2D(-17000, -20000),
      radius: 45,
      heading: 0,
    });
    gateRimToFrontier.name = "Frontier Stargate";
    gateRimToFrontier.sector = "rim";
    gateRimToFrontier.targetSector = "frontier";
    gateRimToFrontier.targetPosition = new Vector2D(22800, 20000);
    this.engine.addEntity(gateRimToFrontier);

    // 5. Generate Asteroids
    const asteroidCount = 45;
    for (let i = 0; i < asteroidCount; i++) {
      this.spawnNewAsteroid(true);
    }

    // 6. Generate NPC merchant freighters
    const merchantNames = [
      "Atlas Hauler",
      "Hermes Cargo",
      "Heavy Freighter",
      "Behemoth",
      "Voyager Hauler",
      "Galleon",
    ];
    for (let i = 0; i < 8; i++) {
      const spawnPlanet = this.planets[i % this.planets.length];
      const spawnPos = spawnPlanet.position.add(
        new Vector2D((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400),
      );
      const isHeavy = i % 2 === 0;

      const mShip = new Ship({
        name: merchantNames[i % merchantNames.length],
        position: spawnPos,
        velocity: new Vector2D(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
        ),
        maxShield: isHeavy ? 500 : 300,
        maxArmor: isHeavy ? 350 : 200,
        cargoCapacity: isHeavy ? 200 : 80,
        credits: 8000,
        thrustPower: isHeavy ? 16000 : 11000,
        turnRate: isHeavy ? 1.2 : 1.5,
      });

      mShip.faction = "Independents";
      const controller = new AIController(mShip, "merchant", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
        factionRegistry: this.factionRegistry,
      });
      this.engine.addEntity(mShip);
      this.ais.push(controller);
    }

    // 7. Generate NPC pirate raiders
    for (let i = 0; i < 7; i++) {
      this.spawnNPCPirate(i);
    }

    // 8. Generate NPC guards
    const guardNames = [
      "System Guard",
      "Sector Police",
      "Navy Destroyer",
      "Aegis Cruiser",
      "Defense Sentinel",
      "Patrol Frigate",
    ];
    for (let i = 0; i < 6; i++) {
      const spawnPlanet = this.planets[i % this.planets.length];
      const spawnPos = spawnPlanet.position.add(
        new Vector2D((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200),
      );
      const isDestroyer = i % 2 === 0;

      const gShip = new Ship({
        name: guardNames[i % guardNames.length],
        position: spawnPos,
        velocity: new Vector2D(
          (Math.random() - 0.5) * 10,
          (Math.random() - 0.5) * 10,
        ),
        maxShield: isDestroyer ? 900 : 400,
        maxArmor: isDestroyer ? 600 : 250,
        thrustPower: isDestroyer ? 26000 : 18000,
        turnRate: isDestroyer ? 1.6 : 2.5,
        weaponDamage: isDestroyer ? 45 : 25,
        weaponCooldown: isDestroyer ? 0.3 : 0.25,
      });

      const sectorId = getSectorFromPosition(spawnPos);
      gShip.faction = this.territoryControl
        ? this.territoryControl.sectors[sectorId].controllingFaction
        : "Federation";
      const controller = new AIController(gShip, "guard", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
        factionRegistry: this.factionRegistry,
      });
      this.engine.addEntity(gShip);
      this.ais.push(controller);
    }

    // Seed authoritative Wandering Cosmic Storms
    const empStorm = new CosmicStorm({
      id: "storm_emp_1",
      name: "Stellar EMP Storm",
      description: "High-intensity solar flares draining energy reserves.",
      position: new Vector2D(-500, -500),
      radius: 400,
      velocity: new Vector2D(5, 5),
      hazardType: "emp_storm",
      color: "rgba(255, 140, 0, 0.12)",
      particleColor: "rgba(255, 140, 0, 0.35)",
    });
    this.cosmicStorms.push(empStorm);
    this.engine.addEntity(empStorm);

    const radioactiveStorm = new CosmicStorm({
      id: "storm_rad_1",
      name: "Radioactive Anomaly",
      description:
        "Ultra-dense toxic fallout fog causing hull erosion and sensor jamming.",
      position: new Vector2D(1200, -800),
      radius: 350,
      velocity: new Vector2D(-6, 4),
      hazardType: "radioactive_cloud",
      color: "rgba(57, 255, 20, 0.12)",
      particleColor: "rgba(57, 255, 20, 0.35)",
    });
    this.cosmicStorms.push(radioactiveStorm);
    this.engine.addEntity(radioactiveStorm);
  }

  /**
   * Assigns each seeded planet a controlling faction (spec 016). Static config
   * keyed by planet name — re-derived every boot, so it needn't persist.
   * Planets not listed fall back to the unaligned Independents.
   */
  assignPlanetFactions() {
    const byName = {
      Sol: "Federation",
      "Valkyrie Depot": "Federation",
      "New Polaris": "Frontier League",
      "Sigma Draconis": "Frontier League",
      "Aurelia Mining Hub": "Frontier League",
      "Kaelis Colony": "Independents",
      "Tenebris Prime": "Independents",
      "Rogue's Hollow": "Pirates",
    };
    for (const planet of this.planets) {
      planet.faction = byName[planet.name] || "Independents";
    }
  }

  handleControlShift(sectorId, oldOwner, newOwner) {
    // Shift factions of planets in this sector belonging to oldOwner to newOwner
    for (const planet of this.planets) {
      if (planet.sector === sectorId && planet.faction === oldOwner) {
        planet.faction = newOwner;
      }
    }

    // Broadcast global chat comms and warning notifications announcing the conquest.
    this.broadcast({
      type: "chat",
      sender: "GALAXY NEWS",
      message: `📢 SECTOR CONQUEST: Faction [${newOwner}] has seized control of the [${sectorId.toUpperCase()}] sector from [${oldOwner}]!`,
      color: "#ffaa00",
    });

    this.broadcastNotification(
      `Sector ${sectorId.toUpperCase()} has been captured by ${newOwner}!`,
      "warning",
    );

    if (this.chronicle) {
      this.chronicle.recordEvent({
        sector: sectorId,
        category: "faction_conquest",
        title: `Sector Conquered: ${sectorId.toUpperCase()}`,
        description: `Faction ${newOwner} has conquered the ${sectorId.toUpperCase()} sector from ${oldOwner}.`,
        impactMetrics: {
          sector: sectorId,
          oldOwner,
          newOwner,
        },
      });
    }
  }

  /**
   * Pulls every tracked player's faction standings a small fraction toward
   * neutral (spec 029) so reputations heal when left alone. The decay math is
   * pure (`FactionRegistry.decayAll`); this is the per-room invocation point,
   * called on the galaxy-heartbeat cadence. `rate` defaults to the registry's
   * configured `decayRate`.
   * @param {number} [rate] - Fraction removed per call (default `decayRate`).
   * @returns {Object<string, Object<string, number>>} Per-player change map.
   */
  decayReputations(rate) {
    if (!this.factionRegistry) return {};
    return this.factionRegistry.decayAll(rate);
  }

  /**
   * Matchmaking metadata for this room (spec 036): id/name plus mode, capacity,
   * current population, and tags. `mode`/`maxPlayers`/`tags` default gracefully
   * so existing rooms work unchanged; a future create-room flow can set them.
   * @returns {{id:string, name:string, mode:string, maxPlayers:number, players:number, tags:Array<string>}}
   */
  metadata() {
    return {
      id: this.id,
      name: this.name,
      mode: this.mode || "standard",
      maxPlayers: Number.isFinite(this.maxPlayers) ? this.maxPlayers : 50,
      players: this.clients ? this.clients.size : 0,
      tags: Array.isArray(this.tags) ? this.tags : [],
    };
  }

  spawnNewAsteroid(initial = false) {
    const angle = Math.random() * Math.PI * 2;
    const dist = initial
      ? 500 + Math.random() * 3200
      : 800 + Math.random() * 2500;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;

    const vx = (Math.random() - 0.5) * 40;
    const vy = (Math.random() - 0.5) * 40;
    const spin = (Math.random() - 0.5) * 0.8;
    const size = 18 + Math.random() * 20;

    const isGem = Math.random() < 0.25;
    const type = isGem ? "gem_asteroid" : "generic";

    const asteroid = new SpaceEntity({
      type: type,
      position: new Vector2D(x, y),
      velocity: new Vector2D(vx, vy),
      mass: size * 30,
      heading: Math.random() * Math.PI,
      angularVelocity: spin,
      radius: size,
    });
    this.engine.addEntity(asteroid);
  }

  spawnNPCPirate(i) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1000 + Math.random() * 2000;
    const spawnPos = new Vector2D(
      Math.cos(angle) * dist,
      Math.sin(angle) * dist,
    );
    const isHeavy = i === 6;

    const pShip = new Ship({
      name: isHeavy
        ? "Pirate Boss Gallows"
        : shipName(
            createSeededRng(Date.now() + i + Math.floor(Math.random() * 1e6)),
          ),
      position: spawnPos,
      velocity: new Vector2D(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
      ),
      maxShield: isHeavy ? 600 : 250,
      maxArmor: isHeavy ? 400 : 150,
      thrustPower: isHeavy ? 20000 : 14000,
      turnRate: isHeavy ? 2.0 : 3.0,
      weaponDamage: isHeavy ? 35 : 18,
      weaponCooldown: isHeavy ? 0.2 : 0.3,
    });
    // Tag the role so threat/loot classification and respawn are
    // name-independent (procedurally-named pirates are still recognised).
    pShip.role = "pirate";
    pShip.faction = "Pirates";

    const controller = new AIController(pShip, "pirate", {
      useUtilityAdvisor: true,
      factionPolicy: this.factionRegistry.factionPolicy(),
      standingPolicy: this.factionRegistry.standingPolicy(),
      factionRegistry: this.factionRegistry,
    });
    this.engine.addEntity(pShip);
    this.ais.push(controller);
  }

  // Tracks every timer the instance schedules so they can be cancelled on
  // destroy() and never keep the process (or the Jest runner) alive on their own.
  scheduleTimer(fn, ms) {
    const id = setTimeout(() => {
      this.pendingTimers.delete(id);
      fn();
    }, ms);
    if (id && typeof id.unref === "function") id.unref();
    this.pendingTimers.add(id);
    return id;
  }

  // Cancels all pending timers. Call when a room is garbage-collected so respawn
  // timers don't fire against a dead instance.
  destroy() {
    for (const id of this.pendingTimers) {
      clearTimeout(id);
    }
    this.pendingTimers.clear();
  }

  scheduleAIRespawn(name, role) {
    if (name === "Siege Raider") return;
    if (name && name.includes("Interceptor")) return;
    this.scheduleTimer(() => {
      if (role === "pirate") {
        const pirateNames = [
          "Pirate Raider",
          "Viper Scout",
          "Marauder",
          "Corsair Star",
          "Gallows Destroyer",
        ];
        this.spawnNPCPirate(Math.floor(Math.random() * pirateNames.length));
      } else if (role === "guard") {
        const spawnPlanet =
          this.planets[Math.floor(Math.random() * this.planets.length)];
        const spawnPos = spawnPlanet.position.add(
          new Vector2D(
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 200,
          ),
        );
        const gShip = new Ship({
          name: name,
          position: spawnPos,
          velocity: new Vector2D(0, 0),
          maxShield: 400,
          maxArmor: 250,
          thrustPower: 18000,
          turnRate: 2.5,
          weaponDamage: 25,
          weaponCooldown: 0.25,
        });
        const sectorId = getSectorFromPosition(spawnPos);
        gShip.faction = this.territoryControl
          ? this.territoryControl.sectors[sectorId].controllingFaction
          : "Federation";
        const controller = new AIController(gShip, "guard", {
          useUtilityAdvisor: true,
          factionPolicy: this.factionRegistry.factionPolicy(),
          standingPolicy: this.factionRegistry.standingPolicy(),
          factionRegistry: this.factionRegistry,
        });
        this.engine.addEntity(gShip);
        this.ais.push(controller);
      } else if (role === "merchant") {
        const spawnPlanet =
          this.planets[Math.floor(Math.random() * this.planets.length)];
        const spawnPos = spawnPlanet.position.add(
          new Vector2D(
            (Math.random() - 0.5) * 400,
            (Math.random() - 0.5) * 400,
          ),
        );
        const mShip = new Ship({
          name: name,
          position: spawnPos,
          velocity: new Vector2D(0, 0),
          maxShield: 300,
          maxArmor: 200,
          cargoCapacity: 80,
          thrustPower: 11000,
          turnRate: 1.5,
        });
        mShip.faction = "Independents";
        const controller = new AIController(mShip, "merchant", {
          useUtilityAdvisor: true,
          factionPolicy: this.factionRegistry.factionPolicy(),
          standingPolicy: this.factionRegistry.standingPolicy(),
          factionRegistry: this.factionRegistry,
        });
        this.engine.addEntity(mShip);
        this.ais.push(controller);
      }
    }, 10000);
  }

  leaveCurrentFleet(clientObj) {
    if (!clientObj.fleetName) return;
    const code = clientObj.fleetName;
    const set = this.fleets.get(code);
    if (set) {
      set.delete(clientObj);
      if (set.size === 0) {
        this.fleets.delete(code);
      } else {
        this.broadcastFleetUpdate(code);
      }
    }
    clientObj.fleetName = null;
    clientObj.send({ type: "fleet_sync", name: null, members: [] });
  }

  broadcastFleetUpdate(fleetCode) {
    const set = this.fleets.get(fleetCode);
    if (!set) return;

    const membersArray = Array.from(set).map((m) => ({
      id: m.id,
      nickname: m.nickname,
      shield: m.ship ? m.ship.shield : 0,
      maxShield: m.ship ? m.ship.maxShield : 200,
      armor: m.ship ? m.ship.armor : 0,
      maxArmor: m.ship ? m.ship.maxArmor : 100,
      x: m.ship ? Math.round(m.ship.position.x) : 0,
      y: m.ship ? Math.round(m.ship.position.y) : 0,
      isLanded: m.isLanded,
      landedOn: m.planetLandedOn ? m.planetLandedOn.name : null,
    }));

    const str = JSON.stringify({
      type: "fleet_sync",
      name: fleetCode,
      members: membersArray,
    });
    for (const m of set) {
      if (m.ws && m.ws.readyState === m.ws.OPEN) {
        m.ws.send(str);
      }
    }
  }

  broadcast(data) {
    const str = JSON.stringify(data);
    for (const client of this.clients.values()) {
      if (client.ws && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(str);
      }
    }
  }

  broadcastNotification(message, style = "info") {
    this.broadcast({
      type: "notification",
      message,
      style,
    });
  }

  broadcastRosterUpdate() {
    const roster = [];
    for (const client of this.clients.values()) {
      roster.push({
        id: client.id,
        nickname: client.nickname,
        credits: client.ship ? client.ship.credits : 0,
        fleetName: client.fleetName,
        status: client.cleanupTimeout
          ? "standby"
          : client.isLanded
            ? "docked"
            : "orbit",
      });
    }

    const str = JSON.stringify({
      type: "lobby_sync",
      count: this.clients.size,
      roster: roster,
    });

    for (const client of this.clients.values()) {
      if (client.ws && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(str);
      }
    }
  }

  serializeEntities() {
    return this.engine.entities
      .filter((ent) => ent.type !== "planet")
      .map((ent) => {
        const base = {
          id: ent.id,
          type: ent.type,
          x: Math.round(ent.position.x * 10) / 10,
          y: Math.round(ent.position.y * 10) / 10,
          vx: Math.round(ent.velocity.x * 10) / 10,
          vy: Math.round(ent.velocity.y * 10) / 10,
          heading: Math.round(ent.heading * 100) / 100,
          radius: ent.radius,
        };

        if (ent.type === "ship") {
          base.name = ent.name;
          base.shield = ent.shield;
          base.maxShield = ent.maxShield;
          base.armor = ent.armor;
          base.maxArmor = ent.maxArmor;
          base.controls = ent.controls;
          base.energy = ent.energy;
          base.maxEnergy = ent.maxEnergy;
          base.heat = ent.heat;
          base.maxHeat = ent.maxHeat;
          base.isOverheated = ent.isOverheated;
          base.isDisabled = ent.isDisabled;
          base.isInterdicting =
            typeof ent.hasActiveInterdictor === "function"
              ? ent.hasActiveInterdictor()
              : false;
          base.outfits = ent.outfits || [];
        } else if (ent.type === "cargo_pod") {
          base.resourceType = ent.resourceType;
          base.amount = ent.amount;
        } else if (ent.type === "warp_gate") {
          base.name = ent.name;
          base.sector = ent.sector;
          base.targetSector = ent.targetSector;
          base.targetPosition = ent.targetPosition
            ? { x: ent.targetPosition.x, y: ent.targetPosition.y }
            : null;
        } else if (ent.type === "cosmic_storm") {
          base.name = ent.name;
          base.description = ent.description;
          base.hazardType = ent.hazardType;
          base.color = ent.color;
          base.particleColor = ent.particleColor;
        }
        return base;
      });
  }

  /**
   * Jettisons cargo from a ship into the room as a scoopable pod. Deterministic:
   * the pod drops just behind the ship and inherits its velocity (no randomness),
   * so the behaviour is unit-testable.
   * @param {Ship} ship - The ship dumping cargo.
   * @param {string} commodity - Cargo type to eject.
   * @param {number} amount - Units to eject (clamped to what is carried).
   * @returns {CargoPod|null} The spawned pod, or null if nothing was jettisoned.
   */
  jettisonFromShip(ship, commodity, amount) {
    if (!ship || typeof ship.jettison !== "function") return null;
    const spec = ship.jettison(commodity, amount);
    if (!spec) return null;
    const behind = ship.getDirectionVector().multiply(-(ship.radius + 8));
    const pod = new CargoPod({
      resourceType: spec.resourceType,
      amount: spec.amount,
      position: ship.position.add(behind),
      velocity: ship.velocity.clone(),
    });
    this.engine.addEntity(pod);
    return pod;
  }

  handleEntityDestroyed(ent) {
    if (ent.type === "projectile") return;

    const killerId = ent.destroyedBy;
    const killerClient = killerId
      ? Array.from(this.clients.values()).find((c) => c.id === killerId)
      : null;
    let killerFleetMembers = null;

    if (killerClient && killerClient.fleetName) {
      killerFleetMembers = Array.from(this.clients.values()).filter(
        (c) => c.fleetName === killerClient.fleetName,
      );
    }

    let killerSquadMembers = null;
    if (killerClient) {
      const squad = squadManager.getSquadForPlayer(killerClient.id);
      if (squad) {
        killerSquadMembers = Array.from(this.clients.values()).filter((c) =>
          squad.memberIds.has(c.id),
        );
      }
    }

    // --- Asteroids destroyed ---
    if (ent.type === "generic" || ent.type === "gem_asteroid") {
      const { resource, count } = mineYield(ent.type, Math.random, {
        yieldMultiplier:
          killerClient && killerClient.ship
            ? killerClient.ship.miningYieldMultiplier
            : 1,
      });

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 50;
        const podVel = new Vector2D(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
        ).add(ent.velocity);

        const pod = new CargoPod({
          resourceType: resource,
          amount: 1,
          position: ent.position.clone(),
          velocity: podVel,
        });
        this.engine.addEntity(pod);
      }
    }

    // --- Ships destroyed ---
    else if (ent.type === "ship") {
      if (ent.name === "Training Drone") {
        const pod = new CargoPod({
          resourceType: "Wreckage Salvage",
          amount: 1,
          position: ent.position.clone(),
          velocity: new Vector2D(0, 0),
        });
        pod.isTrainingSalvage = true;
        this.engine.addEntity(pod);

        for (const client of this.clients.values()) {
          client.tutorialStep = "collect_salvage";
          client.send({
            type: "notification",
            message:
              "Training Drone neutralized! Deploy cargo scoop and harvest the wreckage salvage pod.",
            style: "success",
          });
          client.send({
            type: "tutorial_state",
            step: "collect_salvage",
          });
        }
      }

      if (ent.name === "Diplomatic Transport") {
        for (const client of this.clients.values()) {
          const escMissionIdx = client.missionManager.activeMissions.findIndex(
            (m) => m.type === "escort_ambassador",
          );
          if (escMissionIdx !== -1) {
            client.missionManager.activeMissions.splice(escMissionIdx, 1);
            client.send({
              type: "notification",
              message:
                "MISSION FAILED: The Diplomatic Transport was destroyed!",
              style: "error",
            });
            client.sendStats();
          }
        }
      }

      // Remove AI controller from room's active AIs list to optimize updates and avoid memory leaks
      const aiIdx = this.ais.findIndex((a) => a.ship === ent);
      if (aiIdx !== -1) {
        this.ais.splice(aiIdx, 1);
      }

      // Log vengeance hunter or player vengeance destruction (SPEC-156)
      const entIsPlayer =
        Array.from(this.clients.values()).some((c) => c.ship === ent) ||
        ent.isPlayerMock;
      if (ent.isVengeanceHunter) {
        const killerName = killerClient
          ? killerClient.nickname || killerClient.name
          : ent.destroyedBy || "Unknown Threat";
        if (this.chronicle) {
          this.chronicle.recordEvent({
            sector: this.id,
            category: "combat",
            title: "Vengeance Hunter Neutralized",
            description: `Elite ${ent.faction} Hunter [${ent.name}] has been destroyed in combat by ${killerName}!`,
            impactMetrics: {
              faction: ent.faction,
              hunterName: ent.name,
              destroyedBy: killerName,
            },
          });
        }
        SandboxSecurityRegistry.logViolation(
          "process",
          "vengeance_hunter_destroyed",
          {
            hunterName: ent.name,
            faction: ent.faction,
            destroyedBy: ent.destroyedBy || "Unknown",
            sector: this.id,
          },
        );
      } else if (entIsPlayer) {
        const killerEnt = this.engine.entities.find(
          (e) => e.id === ent.destroyedBy,
        );
        if (killerEnt && killerEnt.isVengeanceHunter) {
          if (this.chronicle) {
            this.chronicle.recordEvent({
              sector: this.id,
              category: "combat",
              title: "Hostile Pilot Executed",
              description: `Commander ${ent.name || "Unknown"} has been executed by ${killerEnt.name} for hostile faction crimes!`,
              impactMetrics: { target: ent.name, executedBy: killerEnt.name },
            });
          }
          SandboxSecurityRegistry.logViolation(
            "process",
            "player_executed_by_vengeance",
            {
              playerName: ent.name,
              executedBy: killerEnt.name,
              sector: this.id,
            },
          );
        }
      }

      // EW1: credit the attributed killer with the victim's worth + a kill.
      if (killerClient && killerClient.ship) {
        recordKill(killerClient.ship, shipBountyValue(ent));
      }

      if (this.factionRegistry && killerClient && ent.faction) {
        if (killerSquadMembers && killerSquadMembers.length > 0) {
          const size = killerSquadMembers.length;
          for (const member of killerSquadMembers) {
            if (
              this.isConflictZone &&
              (ent.faction === this.conflictFactionA ||
                ent.faction === this.conflictFactionB)
            ) {
              const friendlyFaction =
                ent.faction === this.conflictFactionA
                  ? this.conflictFactionB
                  : this.conflictFactionA;
              this.factionRegistry.adjustStanding(
                member.id,
                friendlyFaction,
                2.0 / size,
              );
              this.factionRegistry.adjustStanding(
                member.id,
                ent.faction,
                -2.5 / size,
              );
            } else {
              this.factionRegistry.adjustStanding(
                member.id,
                ent.faction,
                -5.0 / size,
              );
            }
          }
        } else {
          if (
            this.isConflictZone &&
            (ent.faction === this.conflictFactionA ||
              ent.faction === this.conflictFactionB)
          ) {
            const friendlyFaction =
              ent.faction === this.conflictFactionA
                ? this.conflictFactionB
                : this.conflictFactionA;
            this.factionRegistry.adjustStanding(
              killerClient.id,
              friendlyFaction,
              2.0,
            );
            this.factionRegistry.adjustStanding(
              killerClient.id,
              ent.faction,
              -2.5,
            );
          } else {
            this.factionRegistry.adjustStanding(
              killerClient.id,
              ent.faction,
              -5,
            );
          }
        }
      }

      if (this.territoryControl && ent.position) {
        const sectorId = getSectorFromPosition(ent.position);
        const sector = this.territoryControl.sectors[sectorId];
        if (sector) {
          const isPirate = AIController.isPirateShip(ent);
          if (isPirate) {
            const currentController = sector.controllingFaction;
            this.territoryControl.adjustInfluence(
              sectorId,
              currentController,
              3.0,
            );
            this.territoryControl.adjustInfluence(sectorId, "Pirates", -3.0);
            this.broadcast({
              type: "territory_sync",
              sectors: this.territoryControl.sectors,
            });
          } else if (ent.faction && ent.faction !== "Independents") {
            this.territoryControl.adjustInfluence(sectorId, ent.faction, -5.0);
            let opposingFaction = sector.controllingFaction;
            if (this.isConflictZone) {
              opposingFaction =
                ent.faction === this.conflictFactionA
                  ? this.conflictFactionB
                  : this.conflictFactionA;
            }
            if (opposingFaction && opposingFaction !== ent.faction) {
              this.territoryControl.adjustInfluence(
                sectorId,
                opposingFaction,
                5.0,
              );
            }
            this.broadcast({
              type: "territory_sync",
              sectors: this.territoryControl.sectors,
            });
          }
        }
      }

      // Role/faction-based (name-independent) classification — null-safe.
      const isPirate = AIController.isPirateShip(ent);

      // Check bounties for connected and standby clients
      for (const client of this.clients.values()) {
        const completedBounty = client.missionManager.checkBountyCompletion(
          ent.name,
          client.ship,
          this,
        );
        if (completedBounty) {
          if (completedBounty.promotionMessage) {
            client.send({
              type: "notification",
              message: completedBounty.promotionMessage,
              style: "success",
            });
          }

          if (completedBounty.generated) {
            const alertMsg = `GALAXY NEWS: Threat ${completedBounty.targetName} neutralized by player ${client.nickname}! Bounty of ${completedBounty.reward.toLocaleString()} CR claimed!`;
            this.broadcastNotification(alertMsg, "success");
            this.broadcast({
              type: "chat",
              channel: "global",
              sender: "GALAXY-NEWS",
              text: alertMsg,
            });
            if (
              completedBounty.factionChanges &&
              completedBounty.factionChanges.length > 0
            ) {
              for (const change of completedBounty.factionChanges) {
                client.send({
                  type: "notification",
                  message: `Standing with ${change.faction}: +${change.delta.toFixed(1)} merits!`,
                  style: "success",
                });
              }
            }
          }

          if (client.fleetName) {
            const fleetSet = this.fleets.get(client.fleetName);
            if (fleetSet && fleetSet.size > 1) {
              const share = Math.floor(completedBounty.reward / fleetSet.size);
              // Revert full addition on the local player (added inside checkBountyCompletion)
              client.ship.credits -= completedBounty.reward;
              // Add split share to all online fleet members
              for (const member of fleetSet) {
                if (member.ship) {
                  member.ship.credits += share;
                  if (completedBounty.campaignCompleted) {
                    member.send({
                      type: "notification",
                      message: `Fleet Campaign Complete: ${completedBounty.title}! Share: +${share.toLocaleString()} CR`,
                      style: "success",
                    });
                  } else if (completedBounty.stageAdvanced) {
                    member.send({
                      type: "notification",
                      message: `Fleet Story Stage Completed: ${completedBounty.title}! Share: +${share.toLocaleString()} CR`,
                      style: "success",
                    });
                  } else {
                    member.send({
                      type: "notification",
                      message: `Fleet Bounty Claimed: ${completedBounty.title} by ${client.nickname}! Share: +${share.toLocaleString()} CR`,
                      style: "success",
                    });
                  }
                  member.sendStats();
                }
              }
              continue;
            }
          }

          // Solo pilot fallback
          if (completedBounty.campaignCompleted) {
            client.send({
              type: "notification",
              message: completedBounty.message,
              style: "success",
            });
          } else if (completedBounty.stageAdvanced) {
            client.send({
              type: "notification",
              message: completedBounty.message,
              style: "success",
            });
          } else {
            client.send({
              type: "notification",
              message: `Contract Completed: Bounty for ${completedBounty.targetName} claimed! +${completedBounty.reward.toLocaleString()} CR`,
              style: "success",
            });
          }

          client.sendStats();
        }
      }

      if (isPirate) {
        // Eject pirate loot pods!
        const lootCount = Math.floor(Math.random() * 2) + 1; // 1-2
        const lootTypes = ["contraband", "electronics", "machinery"];
        for (let i = 0; i < lootCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 40 + Math.random() * 60;
          const podVel = new Vector2D(
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
          ).add(ent.velocity);
          const resource =
            lootTypes[Math.floor(Math.random() * lootTypes.length)];

          const pod = new CargoPod({
            resourceType: resource,
            amount: 1,
            position: ent.position.clone(),
            velocity: podVel,
          });
          this.engine.addEntity(pod);
        }

        let rewardBase = 1000;
        let faction = this.getGoverningFaction();
        let isElite = false;
        if (ent.name && ent.name.includes("Hunter Elite")) {
          rewardBase = 8000;
          faction = ent.faction || faction;
          isElite = true;
        }

        if (killerClient) {
          const label = isElite ? "Elite Hunter" : "Pirate";
          if (killerSquadMembers && killerSquadMembers.length > 0) {
            const share = Math.floor(rewardBase / killerSquadMembers.length);
            for (const member of killerSquadMembers) {
              if (!member.ship.bountyVouchers) {
                member.ship.bountyVouchers = [];
              }
              member.ship.bountyVouchers.push({ faction, value: share });
              member.send({
                type: "notification",
                message: `${label} eliminated by ${killerClient.nickname}! Squad share bounty voucher: +${share} CR (${faction})`,
                style: "success",
              });
              member.sendStats();
            }
          } else if (killerFleetMembers) {
            const share = Math.floor(rewardBase / killerFleetMembers.length);
            for (const member of killerFleetMembers) {
              if (!member.ship.bountyVouchers) {
                member.ship.bountyVouchers = [];
              }
              member.ship.bountyVouchers.push({ faction, value: share });
              member.send({
                type: "notification",
                message: `${label} eliminated by ${killerClient.nickname}! Fleet share bounty voucher: +${share} CR (${faction})`,
                style: "success",
              });
              member.sendStats();
            }
          } else {
            if (!killerClient.ship.bountyVouchers) {
              killerClient.ship.bountyVouchers = [];
            }
            killerClient.ship.bountyVouchers.push({
              faction,
              value: rewardBase,
            });
            killerClient.send({
              type: "notification",
              message: `${ent.name} neutralized! Earned ${faction} Bounty Voucher: +${rewardBase} CR`,
              style: "success",
            });
            killerClient.sendStats();
          }
        }
      } else {
        // Player/Merchant ship: eject its cargo hold contents as pods
        if (ent.cargo) {
          for (const [resource, count] of Object.entries(ent.cargo)) {
            for (let i = 0; i < count; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 30 + Math.random() * 50;
              const podVel = new Vector2D(
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
              ).add(ent.velocity);

              const pod = new CargoPod({
                resourceType: resource,
                amount: 1,
                position: ent.position.clone(),
                velocity: podVel,
              });
              this.engine.addEntity(pod);
            }
          }
        }
        this.broadcastNotification(
          `${ent.name} has been destroyed in combat.`,
          "info",
        );

        // Check if it's a player ship and respawn them
        const deadClient = Array.from(this.clients.values()).find(
          (c) => c.ship === ent,
        );
        if (deadClient) {
          this.handlePlayerRespawnServer(deadClient);
        }
      }

      // Only schedule AI respawn if it is NOT a player ship
      const isPlayerShip = Array.from(this.clients.values()).some(
        (c) => c.ship === ent,
      );
      if (!isPlayerShip) {
        this.scheduleAIRespawn(ent.name, ent.role);
      }
    }
  }

  handlePlayerRespawnServer(client) {
    client.send({
      type: "notification",
      message: "CRITICAL ERROR: Reactor core compromised! Ejecting capsule...",
      style: "error",
    });

    this.scheduleTimer(() => {
      const fee = Math.floor(client.ship.credits * 0.1);
      client.ship.credits = Math.max(0, client.ship.credits - fee);

      client.ship.armor = client.ship.maxArmor;
      client.ship.shield = client.ship.maxShield;
      client.ship.position = new Vector2D(0, -150);
      client.ship.velocity = new Vector2D(0, 0);
      client.ship.heading = -Math.PI / 2;
      client.ship.clearControls();

      this.engine.addEntity(client.ship);

      client.send({
        type: "notification",
        message: `Cloned replacement hull activated at Sol. Insurance fee: ${fee.toLocaleString()} CR.`,
        style: "info",
      });
      client.sendStats();
    }, 3000);
  }

  /**
   * Scrambles aggressive naval/pirate interceptors to hunt players with highly hostile reputation
   * within this sector.
   * @param {number} dt - Time delta since last tick.
   */
  checkReputationPatrolSpawns(dt) {
    if (!this.patrolSpawnTimer) this.patrolSpawnTimer = 0;
    this.patrolSpawnTimer += dt;
    if (this.patrolSpawnTimer < 10) return; // Evaluate every 10 seconds
    this.patrolSpawnTimer = 0;

    // 1. Identify governing faction of this room
    let governingFaction = "Independents";
    for (const planet of this.planets) {
      if (
        planet.faction === "Federation" ||
        planet.faction === "Frontier League" ||
        planet.faction === "Pirates"
      ) {
        governingFaction = planet.faction;
        break;
      }
    }
    if (governingFaction === "Independents") return;

    // 2. Count active interceptor patrols of this faction
    let activePatrolsCount = 0;
    for (const ent of this.engine.entities) {
      if (
        ent.type === "ship" &&
        ent.role === "guard" &&
        ent.faction === governingFaction &&
        ent.name &&
        ent.name.includes("Interceptor") &&
        !ent.isDestroyed
      ) {
        activePatrolsCount++;
      }
    }
    if (activePatrolsCount >= 2) return;

    // 3. Scan for players who are hostile to the governing faction
    const hostileThreshold =
      this.factionRegistry.options.hostileThreshold || -30;
    for (const ent of this.engine.entities) {
      if (ent.type === "ship" && !ent.isDestroyed && ent.outfits) {
        const isPlayer =
          Array.from(this.clients.values()).some((c) => c.ship === ent) ||
          ent.isPlayerMock;
        if (isPlayer) {
          const standing = this.factionRegistry.getStanding(
            ent.id,
            governingFaction,
          );
          if (standing <= hostileThreshold) {
            this.spawnPatrolInterceptor(ent, governingFaction);
            break; // Spawn one interceptor at a time
          }
        }
      }
    }
  }

  /**
   * Spawns an aggressive interceptor guard that targets the player.
   * @param {Object} playerShip - The player's Ship instance.
   * @param {string} faction - Faction scrambling the patrol.
   */
  spawnPatrolInterceptor(playerShip, faction) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1000;
    const spawnPos = playerShip.position.add(
      new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist),
    );

    const isFederation = faction === "Federation";
    const isFrontier = faction === "Frontier League";

    const pShip = new Ship({
      name: `${faction} Interceptor`,
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: isFederation ? 300 : isFrontier ? 250 : 200,
      maxArmor: isFederation ? 200 : isFrontier ? 150 : 120,
      thrustPower: isFederation ? 16000 : isFrontier ? 15000 : 13000,
      turnRate: 3.0,
      weaponDamage: isFederation ? 22 : 18,
      weaponCooldown: 0.3,
    });

    pShip.role = "guard";
    pShip.faction = faction;

    const controller = new AIController(pShip, "guard", {
      useUtilityAdvisor: true,
      factionPolicy: this.factionRegistry.factionPolicy(),
      standingPolicy: this.factionRegistry.standingPolicy(),
      factionRegistry: this.factionRegistry,
    });

    // Make the patrol aggressively target the hostile player ship
    controller.target = playerShip;

    this.engine.addEntity(pShip);
    this.ais.push(controller);

    this.broadcast({
      type: "notification",
      message: `Warning: Hostile ${faction} Interceptor scrambled to your location!`,
      style: "error",
    });
  }

  /**
   * Scrambles highly aggressive elite faction hunters to hunt players with nadir reputation (< -50).
   * @param {number} dt - Time delta in seconds.
   */
  checkEliteHunterSpawns(dt) {
    if (!this.hunterSpawnTimer) this.hunterSpawnTimer = 0;
    this.hunterSpawnTimer += dt;
    if (this.hunterSpawnTimer < 12) return; // check every 12 seconds
    this.hunterSpawnTimer = 0;

    // Scan for players who are highly hostile to any major faction (standing < -50)
    for (const ent of this.engine.entities) {
      if (ent.type === "ship" && !ent.isDestroyed) {
        const isPlayer =
          Array.from(this.clients.values()).some((c) => c.ship === ent) ||
          ent.isPlayerMock;
        if (!isPlayer) continue;

        for (const faction of ["Federation", "Frontier League", "Pirates"]) {
          const standing = this.factionRegistry.getStanding(ent.id, faction);
          if (standing < -50) {
            // Check if any active vengeance hunter of this faction already exists in the room
            const exists = this.engine.entities.some(
              (e) =>
                e.type === "ship" &&
                e.isVengeanceHunter &&
                e.faction === faction &&
                !e.isDestroyed,
            );
            if (exists) continue;

            // Check player-specific hunter cooldown (e.g. 120 seconds max per spawn)
            if (!this.lastEliteHunterSpawnTime) {
              this.lastEliteHunterSpawnTime = {};
            }
            const lastSpawn = this.lastEliteHunterSpawnTime[ent.id] || 0;
            if (Date.now() - lastSpawn < 120000) continue; // 120 seconds cooldown

            this.lastEliteHunterSpawnTime[ent.id] = Date.now();
            this.spawnEliteHunter(ent, faction);
            break; // Spawn one wing at a time
          }
        }
      }
    }
  }

  /**
   * Spawns a premium, highly aggressive elite faction hunter wing targeting the hostile player.
   * @param {Object} playerShip - The hostile player's Ship instance.
   * @param {string} faction - The faction scrambling the elite hunter wing.
   */
  spawnEliteHunter(playerShip, faction) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1100; // Spawn slightly out of view
    const spawnPos = playerShip.position.add(
      new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist),
    );

    if (this.chronicle) {
      this.chronicle.recordEvent({
        sector: this.id,
        category: "combat",
        title: "Vengeance Wing Dispatched",
        description: `An elite ${faction} Vengeance Wing has been scrambled to eliminate hostile player ${playerShip.name || "Unknown"}!`,
        impactMetrics: { faction, target: playerShip.name, wingSize: 3 },
      });
    }

    SandboxSecurityRegistry.logViolation("process", "vengeance_hunter_spawn", {
      faction,
      targetShip: playerShip.name || "Unknown",
      targetPlayerId: playerShip.id,
      sector: this.id,
      leader: `${faction} Hunter Elite`,
      wingSize: 3,
    });

    // 1. Wing Leader
    const leaderShip = new Ship({
      name: `${faction} Hunter Elite`,
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 1200,
      maxArmor: 1000,
      thrustPower: 32000,
      turnRate: 3.2,
      weaponDamage: 55,
      weaponCooldown: 0.18,
    });
    leaderShip.role = "guard";
    leaderShip.faction = faction;
    leaderShip.outfits = [
      "Hyperdrive Interdictor Matrix",
      "Interdictor Matrix",
    ];
    leaderShip.isVengeanceHunter = true;
    leaderShip.combatValue = 50000;
    leaderShip.combatRating = 320; // Elite

    const leaderController = new AIController(leaderShip, "guard", {
      useUtilityAdvisor: true,
      factionPolicy: this.factionRegistry.factionPolicy(),
      standingPolicy: this.factionRegistry.standingPolicy(),
      factionRegistry: this.factionRegistry,
    });
    leaderController.target = playerShip;

    this.engine.addEntity(leaderShip);
    this.ais.push(leaderController);

    // 2. Wingmen
    const offsets = [-0.25, 0.25];
    for (let i = 0; i < offsets.length; i++) {
      const wingmanAngle = angle + offsets[i];
      const wingmanPos = playerShip.position.add(
        new Vector2D(
          Math.cos(wingmanAngle) * (dist + 50),
          Math.sin(wingmanAngle) * (dist + 50),
        ),
      );

      const wingmanShip = new Ship({
        name: `${faction} Vengeance Wingman ${i === 0 ? "Alpha" : "Beta"}`,
        position: wingmanPos,
        velocity: new Vector2D(0, 0),
        maxShield: 600,
        maxArmor: 500,
        thrustPower: 26000,
        turnRate: 3.0,
        weaponDamage: 35,
        weaponCooldown: 0.25,
      });
      wingmanShip.role = "guard";
      wingmanShip.faction = faction;
      wingmanShip.outfits = ["Interdictor Matrix"];
      wingmanShip.isVengeanceHunter = true;
      wingmanShip.combatValue = 20000;
      wingmanShip.combatRating = 200; // Dangerous

      const wingmanController = new AIController(wingmanShip, "guard", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
        factionRegistry: this.factionRegistry,
      });
      wingmanController.target = playerShip;

      this.engine.addEntity(wingmanShip);
      this.ais.push(wingmanController);
    }

    this.broadcast({
      type: "notification",
      message: `HIGH THREAT WARNING: ${faction} Vengeance Wing has entered the sector to eliminate you!`,
      style: "error",
    });
  }

  /**
   * Scrambles ambush pirate raiders to target the Diplomatic Transport or the player
   * during an active Escort Ambassador mission.
   * @param {number} dt - Time delta in seconds.
   */
  checkEscortAmbushSpawns(dt) {
    if (!this.escortAmbushTimer) this.escortAmbushTimer = 0;
    this.escortAmbushTimer += dt;
    if (this.escortAmbushTimer < 15) return; // check every 15 seconds
    this.escortAmbushTimer = 0;

    // Check if the Diplomatic Transport is active in this sector
    const transport = this.engine.entities.find(
      (ent) =>
        ent.type === "ship" &&
        ent.name === "Diplomatic Transport" &&
        !ent.isDestroyed,
    );
    if (!transport) return;

    // Check if we already have too many ambushers in space to avoid entity overcrowding
    let activeAmbushers = 0;
    for (const ent of this.engine.entities) {
      if (
        ent.type === "ship" &&
        ent.name &&
        ent.name.includes("Ambush Raider") &&
        !ent.isDestroyed
      ) {
        activeAmbushers++;
      }
    }
    if (activeAmbushers >= 2) return;

    // 50% chance to spawn an ambush raider near the transport
    if (Math.random() < 0.5) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 800; // spawn slightly off screen
      const spawnPos = transport.position.add(
        new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist),
      );

      const raider = new Ship({
        name: "Ambush Raider",
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 250,
        maxArmor: 150,
        thrustPower: 16000,
        turnRate: 3.0,
        weaponDamage: 25,
        weaponCooldown: 0.25,
      });
      raider.role = "pirate";
      raider.faction = "Pirates";

      const controller = new AIController(raider, "pirate", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
        factionRegistry: this.factionRegistry,
      });
      controller.target = transport; // Target the fragile transport!

      this.engine.addEntity(raider);
      this.ais.push(controller);

      this.broadcast({
        type: "notification",
        message:
          "AMBUSH INCOMING: Pirate Ambush Raider has locked on the Diplomatic Transport!",
        style: "error",
      });
    }
  }

  /**
   * Identifies the governing faction of this room/sector based on planets.
   * @returns {string} Governing faction name.
   */
  getGoverningFaction() {
    for (const planet of this.planets) {
      if (
        planet.faction === "Federation" ||
        planet.faction === "Frontier League" ||
        planet.faction === "Pirates"
      ) {
        return planet.faction;
      }
    }
    return "Independents";
  }

  /**
   * Scans active players carrying contraband in space.
   * Remote security sweeps are executed when a player flies near a faction patrol.
   * @param {number} dt - Time delta in seconds.
   */
  checkContrabandSpaceScans(dt) {
    if (!this.spaceScanAccumulator) this.spaceScanAccumulator = 0;
    this.spaceScanAccumulator += dt;
    if (this.spaceScanAccumulator < 5) return; // Evaluate every 5 seconds
    this.spaceScanAccumulator = 0;

    // 1. Identify governing faction of this room
    const governingFaction = this.getGoverningFaction();
    if (governingFaction === "Independents") return;

    // 2. Scan players carrying contraband
    for (const ent of this.engine.entities) {
      if (
        ent.type !== "ship" ||
        ent.isDestroyed ||
        !ent.cargo ||
        !(ent.cargo.contraband > 0)
      ) {
        continue;
      }

      const isPlayer =
        Array.from(this.clients.values()).some((c) => c.ship === ent) ||
        ent.isPlayerMock;
      if (!isPlayer) continue;

      // Handle cooldown using a simple delta subtraction
      if (!ent.spaceScanCooldown) ent.spaceScanCooldown = 0;
      if (ent.spaceScanCooldown > 0) {
        ent.spaceScanCooldown -= 5; // We ran after a 5s accumulator pulse
        continue;
      }

      // 3. Find any close guard belonging to the governing faction within 600 units
      let closeGuard = null;
      for (const guard of this.engine.entities) {
        if (
          guard.type === "ship" &&
          !guard.isDestroyed &&
          guard.role === "guard" &&
          guard.faction === governingFaction
        ) {
          const dist = ent.position.distance(guard.position);
          if (dist <= 600) {
            closeGuard = guard;
            break;
          }
        }
      }

      if (closeGuard) {
        // Trigger space scan check!
        ent.spaceScanCooldown = 30; // 30 seconds cooldown

        let bestJammerValue = 0;
        if (ent.outfits) {
          for (const outfitName of ent.outfits) {
            const spec = DEFAULT_OUTFITS.find((o) => o.name === outfitName);
            if (spec && spec.type === "jammer") {
              if (spec.value > bestJammerValue) {
                bestJammerValue = spec.value;
              }
            }
          }
        }

        let scanDetected = true;
        if (bestJammerValue > 0) {
          const rng = ent.rng || Math.random;
          if (rng() < bestJammerValue) {
            scanDetected = false;
          }
        }

        this.broadcast({
          type: "notification",
          message: `[${closeGuard.name}]: 'Security sweep in progress! Stand by for scan.'`,
          style: "info",
        });

        if (scanDetected) {
          // Confiscate and fine or standings penalty
          this.factionRegistry.adjustStanding(ent.id, governingFaction, -15);

          this.broadcast({
            type: "notification",
            message: `[${closeGuard.name}]: 'Contraband detected! Faction standing reduced. Stand by for security intervention.'`,
            style: "error",
          });

          // Set the guard AI to aggressively lock target
          const guardCtrl = this.ais.find((ai) => ai.ship === closeGuard);
          if (guardCtrl) {
            guardCtrl.target = ent;
            guardCtrl.ship.target = ent;
          }
        } else {
          this.broadcast({
            type: "notification",
            message: `[${closeGuard.name}]: 'Scan clear. Carry on, pilot.'`,
            style: "success",
          });
        }
      }
    }
  }

  /**
   * Triggers a faction conflict battleground zone in this sector, spawning opposing war fleets.
   * @param {string} [factionA="Federation"] - Primary conflict faction.
   * @param {string} [factionB="Pirates"] - Secondary conflict faction.
   */
  triggerConflictZone(factionA = "Federation", factionB = "Pirates") {
    this.isConflictZone = true;
    this.conflictFactionA = factionA;
    this.conflictFactionB = factionB;

    if (this.chronicle) {
      this.chronicle.recordEvent({
        sector: this.id,
        category: "combat",
        title: "Faction Conflict Triggered",
        description: `War fleets from ${factionA} and ${factionB} have clashed in sector ${this.name || this.id}! Sector is now an active combat zone.`,
        impactMetrics: { factionA, factionB },
      });
    }

    // Spawn Faction A combatants
    for (let i = 0; i < 3; i++) {
      const aShip = new Ship({
        name: `${factionA} Defender Mk ${i + 1}`,
        position: new Vector2D(-250 + i * 50, (Math.random() - 0.5) * 150),
        velocity: new Vector2D(0, 0),
        maxShield: 500,
        maxArmor: 350,
        thrustPower: 22000,
        turnRate: 3.0,
        weaponDamage: 30,
        weaponCooldown: 0.22,
      });
      aShip.faction = factionA;
      const controller = new AIController(aShip, "guard", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
        factionRegistry: this.factionRegistry,
      });
      controller.isConflictZone = true;
      controller.conflictFactionA = factionA;
      controller.conflictFactionB = factionB;
      this.engine.addEntity(aShip);
      this.ais.push(controller);
    }

    // Spawn Faction B combatants
    for (let i = 0; i < 3; i++) {
      const bShip = new Ship({
        name: `${factionB} Raider Mk ${i + 1}`,
        position: new Vector2D(250 - i * 50, (Math.random() - 0.5) * 150),
        velocity: new Vector2D(0, 0),
        maxShield: 500,
        maxArmor: 350,
        thrustPower: 22000,
        turnRate: 3.0,
        weaponDamage: 30,
        weaponCooldown: 0.22,
      });
      bShip.faction = factionB;
      const controller = new AIController(bShip, "pirate", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
        factionRegistry: this.factionRegistry,
      });
      controller.isConflictZone = true;
      controller.conflictFactionA = factionA;
      controller.conflictFactionB = factionB;
      this.engine.addEntity(bShip);
      this.ais.push(controller);
    }
  }
}
