import { Vector2D } from "../physics/Vector2D.js";
import { Ship } from "./Ship.js";
import { Planet } from "./Planet.js";
import { SpaceEngine } from "./SpaceEngine.js";
import { SpaceEntity } from "./SpaceEntity.js";
import { AIController } from "./ai/AIController.js";
import { CargoPod } from "./CargoPod.js";
import { EconomyManager } from "./EconomyManager.js";
import { FactionRegistry } from "./FactionRegistry.js";
import { GalaxyHeartbeat } from "./GalaxyHeartbeat.js";
import { PLANET_PROFILES } from "./ProductionModel.js";
import { recordKill, shipBountyValue } from "./CombatRating.js";
import { mineYield } from "./Mining.js";
import { shipName, createSeededRng } from "./NameGenerator.js";

// Which sectors share trade routes (warp-gate connected) for economic diffusion.
export const SECTOR_ADJACENCY = {
  core: ["frontier"],
  frontier: ["core", "rim"],
  rim: ["frontier"],
};

export const BASE_MARKETS = {
  Sol: {
    food: 100,
    electronics: 300,
    minerals: 150,
    luxuries: 600,
    contraband: 250,
    machinery: 100,
    ore: 90,
  },
  "New Polaris": {
    food: 220,
    electronics: 320,
    minerals: 50,
    luxuries: 650,
    contraband: 300,
    machinery: 220,
    ore: 55,
  },
  "Sigma Draconis": {
    food: 120,
    electronics: 120,
    minerals: 250,
    luxuries: 500,
    contraband: 200,
    machinery: 160,
    ore: 130,
  },
  "Kaelis Colony": {
    food: 40,
    electronics: 420,
    minerals: 180,
    luxuries: 550,
    contraband: 280,
    machinery: 190,
    ore: 85,
  },
  "Aurelia Mining Hub": {
    food: 150,
    electronics: 290,
    minerals: 70,
    luxuries: 580,
    contraband: 260,
    machinery: 150,
    ore: 50,
  },
  "Tenebris Prime": {
    food: 160,
    electronics: 450,
    minerals: 200,
    luxuries: 220,
    contraband: 400,
    machinery: 240,
    ore: 95,
  },
  "Valkyrie Depot": {
    food: 110,
    electronics: 380,
    minerals: 190,
    luxuries: 520,
    contraband: 220,
    machinery: 80,
    ore: 125,
  },
  "Rogue's Hollow": {
    food: 250,
    electronics: 220,
    minerals: 160,
    luxuries: 450,
    contraband: 60,
    machinery: 180,
    ore: 80,
  },
};

export class GameInstance {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.engine = new SpaceEngine({ globalDrag: 0.1, restitution: 0.4 });
    this.planets = [];
    this.ais = [];
    this.fleets = new Map(); // fleetName -> Set<clientObj>
    this.clients = new Map(); // ws -> clientObj
    this.activeEconomicEvent = null;
    this.activeSectorEvent = null;
    this.lastActiveTime = Date.now();
    this.pendingTimers = new Set();

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
    this.baseMarkets = BASE_MARKETS;

    // Seed initial entities
    this.seedGalaxy();

    // Assign each seeded planet a controlling faction (static config).
    this.assignPlanetFactions();

    // Initialize the dynamic economy manager
    this.economyManager = new EconomyManager(this.planets);

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

      gShip.faction = "Federation";
      const controller = new AIController(gShip, "guard", {
        useUtilityAdvisor: true,
        factionPolicy: this.factionRegistry.factionPolicy(),
        standingPolicy: this.factionRegistry.standingPolicy(),
      });
      this.engine.addEntity(gShip);
      this.ais.push(controller);
    }
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
        gShip.faction = "Federation";
        const controller = new AIController(gShip, "guard", {
          useUtilityAdvisor: true,
          factionPolicy: this.factionRegistry.factionPolicy(),
          standingPolicy: this.factionRegistry.standingPolicy(),
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
      if (client.ws.readyState === client.ws.OPEN) {
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
      // Remove AI controller from room's active AIs list to optimize updates and avoid memory leaks
      const aiIdx = this.ais.findIndex((a) => a.ship === ent);
      if (aiIdx !== -1) {
        this.ais.splice(aiIdx, 1);
      }

      // EW1: credit the attributed killer with the victim's worth + a kill.
      if (killerClient && killerClient.ship) {
        recordKill(killerClient.ship, shipBountyValue(ent));
      }

      // spec 016: a kill shifts the killer's standing with the victim's faction,
      // propagating to that faction's allies/enemies (the registry handles the
      // spread). Killing a faction member lowers standing with them — so hunting
      // Pirates (enemy of the law) raises your Federation/Frontier standing.
      if (this.factionRegistry && killerClient && ent.faction) {
        this.factionRegistry.adjustStanding(killerClient.id, ent.faction, -5);
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

        const rewardBase = 1000;
        if (killerClient) {
          if (killerFleetMembers) {
            const share = Math.floor(rewardBase / killerFleetMembers.length);
            for (const member of killerFleetMembers) {
              member.ship.credits += share;
              member.send({
                type: "notification",
                message: `Pirate eliminated by ${killerClient.nickname}! Fleet share bounty: +${share} CR`,
                style: "success",
              });
              member.sendStats();
            }
          } else {
            killerClient.ship.credits += rewardBase;
            killerClient.send({
              type: "notification",
              message: `${ent.name} neutralized! Bounty claimed +1,000 CR`,
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
}
