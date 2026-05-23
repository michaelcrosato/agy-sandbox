import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

import { Vector2D } from "./physics/Vector2D.js";
import { Ship } from "./engine/Ship.js";
import { Planet } from "./engine/Planet.js";
import { SpaceEngine } from "./engine/SpaceEngine.js";
import { SpaceEntity } from "./engine/SpaceEntity.js";
import { AIController } from "./engine/ai/AIController.js";
import { MissionManager } from "./engine/MissionManager.js";
import { NEBULAE } from "./engine/Nebulae.js";
import { CargoPod } from "./engine/CargoPod.js";

// Paths for static file server
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = process.env.PORT || 8080;

// 1. Initialize HTTP Server
const server = http.createServer((req, res) => {
  let safeUrl = req.url.split("?")[0];
  if (safeUrl === "/" || safeUrl === "") {
    safeUrl = "/index.html";
  }

  const filePath = path.join(ROOT_DIR, safeUrl);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let mime = "text/plain";
    if (ext === ".html") mime = "text/html";
    else if (ext === ".css") mime = "text/css";
    else if (ext === ".js") mime = "application/javascript";
    else if (ext === ".json") mime = "application/json";
    else if (ext === ".png") mime = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    else if (ext === ".svg") mime = "image/svg+xml";

    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

// 2. Initialize Space Engine & Authoritative World State
const engine = new SpaceEngine({ globalDrag: 0.1, restitution: 0.4 });
const planets = [];
const ais = [];

// Initialize Systems / Planets
// Initialize Systems / Planets
const solPlanet = new Planet({
  name: "Sol",
  description: "The historic cradle of humanity and bustling trade center of the inner systems. High luxury demand, cheap machinery.",
  color: "#4d6fff",
  position: new Vector2D(0, 0),
  radius: 65,
  market: { food: 100, electronics: 300, minerals: 150, luxuries: 600, contraband: 250, machinery: 100 },
  sector: "core"
});
planets.push(solPlanet);
engine.addEntity(solPlanet);

const valkyriePlanet = new Planet({
  name: "Valkyrie Depot",
  description: "Core fleet military staging area. Produces high-grade heavy machinery, demands electronics.",
  color: "#ff1744",
  position: new Vector2D(2000, 500),
  radius: 62,
  market: { food: 110, electronics: 380, minerals: 190, luxuries: 520, contraband: 220, machinery: 80 },
  sector: "core"
});
planets.push(valkyriePlanet);
engine.addEntity(valkyriePlanet);

// Frontier Systems Sector (Offset X:+20000, Y:+20000)
const polarisPlanet = new Planet({
  name: "New Polaris",
  description: "An icy frontier industrial colony rich in raw mineral extractions. High food demand, cheap raw minerals.",
  color: "#e0f7fa",
  position: new Vector2D(22000, 18800),
  radius: 55,
  market: { food: 220, electronics: 320, minerals: 50, luxuries: 650, contraband: 300, machinery: 220 },
  sector: "frontier"
});
planets.push(polarisPlanet);
engine.addEntity(polarisPlanet);

const draconisPlanet = new Planet({
  name: "Sigma Draconis",
  description: "A high-tech research outpost specializing in advanced electronics production. Demands minerals, cheap electronics.",
  color: "#00f2fe",
  position: new Vector2D(17800, 21600),
  radius: 60,
  market: { food: 120, electronics: 120, minerals: 250, luxuries: 500, contraband: 200, machinery: 160 },
  sector: "frontier"
});
planets.push(draconisPlanet);
engine.addEntity(draconisPlanet);

const aureliaPlanet = new Planet({
  name: "Aurelia Mining Hub",
  description: "Outer planetary asteroid refinery. Demands food, produces cheap raw metals and machinery.",
  color: "#ff9100",
  position: new Vector2D(21800, 21800),
  radius: 58,
  market: { food: 150, electronics: 290, minerals: 70, luxuries: 580, contraband: 260, machinery: 150 },
  sector: "frontier"
});
planets.push(aureliaPlanet);
engine.addEntity(aureliaPlanet);

// Outer Lawless Rim Sector (Offset X:-20000, Y:-20000)
const kaelisPlanet = new Planet({
  name: "Kaelis Colony",
  description: "An agricultural breadbasket producing vast food supplies. Demands electronics, cheap food.",
  color: "#00e676",
  position: new Vector2D(-21800, -21800),
  radius: 60,
  market: { food: 40, electronics: 420, minerals: 180, luxuries: 550, contraband: 280, machinery: 190 },
  sector: "rim"
});
planets.push(kaelisPlanet);
engine.addEntity(kaelisPlanet);

const tenebrisPlanet = new Planet({
  name: "Tenebris Prime",
  description: "A mysterious colony inside a dark nebula. Produces top-tier scientific luxuries, demands electronics.",
  color: "#d500f9",
  position: new Vector2D(-20600, -17600),
  radius: 55,
  market: { food: 160, electronics: 450, minerals: 200, luxuries: 220, contraband: 400, machinery: 240 },
  sector: "rim"
});
planets.push(tenebrisPlanet);
engine.addEntity(tenebrisPlanet);

const roguesPlanet = new Planet({
  name: "Rogue's Hollow",
  description: "A lawless pirate anchorage hidden deep inside a dense asteroid field. Smuggler contraband is cheap here.",
  color: "#e040fb",
  position: new Vector2D(-22800, -20500),
  radius: 52,
  market: { food: 250, electronics: 220, minerals: 160, luxuries: 450, contraband: 60, machinery: 180 },
  sector: "rim"
});
planets.push(roguesPlanet);
engine.addEntity(roguesPlanet);

// Hyperlane Warp Stargates Seeding (Endless Sky Navigation)
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
engine.addEntity(gateCoreToFrontier);

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
engine.addEntity(gateFrontierToCore);

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
engine.addEntity(gateFrontierToRim);

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
engine.addEntity(gateRimToFrontier);


const BASE_MARKETS = {
  "Sol": { food: 100, electronics: 300, minerals: 150, luxuries: 600, contraband: 250, machinery: 100 },
  "New Polaris": { food: 220, electronics: 320, minerals: 50, luxuries: 650, contraband: 300, machinery: 220 },
  "Sigma Draconis": { food: 120, electronics: 120, minerals: 250, luxuries: 500, contraband: 200, machinery: 160 },
  "Kaelis Colony": { food: 40, electronics: 420, minerals: 180, luxuries: 550, contraband: 280, machinery: 190 },
  "Aurelia Mining Hub": { food: 150, electronics: 290, minerals: 70, luxuries: 580, contraband: 260, machinery: 150 },
  "Tenebris Prime": { food: 160, electronics: 450, minerals: 200, luxuries: 220, contraband: 400, machinery: 240 },
  "Valkyrie Depot": { food: 110, electronics: 380, minerals: 190, luxuries: 520, contraband: 220, machinery: 80 },
  "Rogue's Hollow": { food: 250, electronics: 220, minerals: 160, luxuries: 450, contraband: 60, machinery: 180 }
};

let activeEconomicEvent = null; // { planetName, commodity, originalPrice }

function runDynamicEconomyTick() {
  // Revert previous event to baseline
  if (activeEconomicEvent) {
    const prevPlanet = planets.find(p => p.name === activeEconomicEvent.planetName);
    if (prevPlanet && BASE_MARKETS[activeEconomicEvent.planetName]) {
      const origPrice = BASE_MARKETS[activeEconomicEvent.planetName][activeEconomicEvent.commodity];
      prevPlanet.market[activeEconomicEvent.commodity] = origPrice;
      
      broadcast({
        type: "market_sync",
        planetName: prevPlanet.name,
        market: prevPlanet.market
      });
    }
  }

  // Select random planet & commodity
  const planet = planets[Math.floor(Math.random() * planets.length)];
  const commodities = Object.keys(BASE_MARKETS[planet.name]);
  const commodity = commodities[Math.floor(Math.random() * commodities.length)];
  const isShortage = Math.random() < 0.5;

  const originalPrice = BASE_MARKETS[planet.name][commodity];
  const multiplier = isShortage ? 1.8 : 0.5;
  const newPrice = Math.round(originalPrice * multiplier);

  planet.market[commodity] = newPrice;
  activeEconomicEvent = {
    planetName: planet.name,
    commodity,
    originalPrice
  };

  // Broadcast market sync to all connected clients
  broadcast({
    type: "market_sync",
    planetName: planet.name,
    market: planet.market
  });

  const formattedMsg = isShortage
    ? `MARKET ALERT: ${planet.name} reports severe ${commodity.toUpperCase()} shortage! Prices soared to ${newPrice} CR!`
    : `MARKET ALERT: ${planet.name} reports massive ${commodity.toUpperCase()} surplus! Prices dropped to ${newPrice} CR!`;

  broadcastNotification(formattedMsg, isShortage ? "error" : "success");

  // Send system chat message so they see it in sector comms
  const chatPayload = {
    type: "chat",
    channel: "global",
    sender: "SYSTEM-ECONOMY",
    text: formattedMsg
  };
  for (const c of clients.values()) {
    c.send(chatPayload);
  }
}

// Start economy loop running every 45 seconds
setInterval(runDynamicEconomyTick, 45000);

let activeSectorEvent = null; // { type: "siege"|"emp", planetName, spawnedShipIds: [] }

function runDynamicSectorEventTick() {
  // 1. Clean up previous event
  if (activeSectorEvent) {
    if (activeSectorEvent.type === "siege") {
      // Clear spawned raiders
      for (const shipId of activeSectorEvent.spawnedShipIds) {
        const ent = engine.entities.find(e => e.id === shipId);
        if (ent) {
          engine.removeEntity(ent);
        }
        const aiIdx = ais.findIndex(a => a.ship.id === shipId);
        if (aiIdx !== -1) {
          ais.splice(aiIdx, 1);
        }
      }
      
      const formattedMsg = `EVENT OVER: The Pirate Siege at ${activeSectorEvent.planetName} has been repelled!`;
      broadcastNotification(formattedMsg, "success");
      
      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg
      };
      broadcast(chatPayload);
    } else if (activeSectorEvent.type === "emp") {
      const formattedMsg = `EVENT OVER: The Solar EMP Ion Storm at ${activeSectorEvent.planetName} has subsided.`;
      broadcastNotification(formattedMsg, "success");
      
      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg
      };
      broadcast(chatPayload);
    }
    activeSectorEvent = null;
  }

  // 2. Decide new event type and planet (50/50 chance of siege or emp)
  const eventTypes = ["siege", "emp"];
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  // Sol is a safe zone (no EMP storms should affect Sol)
  let targetPlanet;
  if (eventType === "emp") {
    // Exclude Sol planet
    const nonSolPlanets = planets.filter(p => p.name !== "Sol");
    targetPlanet = nonSolPlanets[Math.floor(Math.random() * nonSolPlanets.length)];
  } else {
    targetPlanet = planets[Math.floor(Math.random() * planets.length)];
  }

  if (!targetPlanet) return;

  if (eventType === "siege") {
    const spawnedShipIds = [];
    const count = 2; // Spawn 2 heavy raiders as per specifications
    
    for (let i = 0; i < count; i++) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = targetPlanet.landingRadius + 180 + Math.random() * 50;
      const spawnPos = targetPlanet.position.add(new Vector2D(Math.cos(spawnAngle) * spawnDist, Math.sin(spawnAngle) * spawnDist));
      const shipId = "siege-raider-" + Math.random().toString(36).substring(2, 9);
      
      const raiderShip = new Ship({
        id: shipId,
        name: "Siege Raider",
        position: spawnPos,
        velocity: new Vector2D((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
        heading: Math.random() * Math.PI * 2,
        maxShield: 500,
        maxArmor: 350,
        thrustPower: 18000,
        turnRate: 2.2,
        weaponDamage: 30,
        weaponCooldown: 0.25,
      });
      raiderShip.role = "pirate";

      const controller = new AIController(raiderShip, "pirate");
      engine.addEntity(raiderShip);
      ais.push(controller);
      spawnedShipIds.push(shipId);
    }

    activeSectorEvent = {
      type: "siege",
      planetName: targetPlanet.name,
      spawnedShipIds: spawnedShipIds
    };

    const formattedMsg = `RED ALERT: Pirate Siege detected at ${targetPlanet.name}! Heavy raiders are attacking the trade hub!`;
    broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg
    };
    broadcast(chatPayload);

  } else if (eventType === "emp") {
    activeSectorEvent = {
      type: "emp",
      planetName: targetPlanet.name,
      spawnedShipIds: []
    };

    const formattedMsg = `ENVIRONMENT ALERT: Solar EMP Ion Storm detected at ${targetPlanet.name}! Shield regeneration disabled within 400u!`;
    broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg
    };
    broadcast(chatPayload);
  }

  // Sync event status to all connected clients
  broadcastEventSync();
}

function broadcastEventSync() {
  const eventPayload = {
    type: "event_sync",
    event: activeSectorEvent ? {
      type: activeSectorEvent.type,
      planetName: activeSectorEvent.planetName
    } : null
  };
  broadcast(eventPayload);
}

// Run dynamic sector events every 90 seconds
setInterval(runDynamicSectorEventTick, 90000);


// Generate Asteroids
const asteroidCount = 45;
for (let i = 0; i < asteroidCount; i++) {
  spawnNewAsteroid(true);
}

function spawnNewAsteroid(initial = false) {
  const angle = Math.random() * Math.PI * 2;
  const dist = initial ? 500 + Math.random() * 3200 : 800 + Math.random() * 2500;
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
  engine.addEntity(asteroid);
}

// Generate NPC merchant freighters
const merchantNames = ["Atlas Hauler", "Hermes Cargo", "Heavy Freighter", "Behemoth", "Voyager Hauler", "Galleon"];
for (let i = 0; i < 8; i++) {
  const spawnPlanet = planets[i % planets.length];
  const spawnPos = spawnPlanet.position.add(new Vector2D((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400));
  const isHeavy = i % 2 === 0;

  const mShip = new Ship({
    name: merchantNames[i % merchantNames.length],
    position: spawnPos,
    velocity: new Vector2D((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15),
    maxShield: isHeavy ? 500 : 300,
    maxArmor: isHeavy ? 350 : 200,
    cargoCapacity: isHeavy ? 200 : 80,
    credits: 8000,
    thrustPower: isHeavy ? 16000 : 11000,
    turnRate: isHeavy ? 1.2 : 1.5,
  });

  const controller = new AIController(mShip, "merchant");
  engine.addEntity(mShip);
  ais.push(controller);
}

// Generate NPC pirate raiders
const pirateNames = ["Pirate Raider", "Viper Scout", "Marauder", "Corsair Star", "Gallows Destroyer"];
for (let i = 0; i < 7; i++) {
  spawnNPCPirate(i);
}

function spawnNPCPirate(i) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1000 + Math.random() * 2000;
  const spawnPos = new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist);
  const isHeavy = i === 6;

  const pShip = new Ship({
    name: isHeavy ? "Pirate Boss Gallows" : pirateNames[i % pirateNames.length],
    position: spawnPos,
    velocity: new Vector2D((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50),
    maxShield: isHeavy ? 600 : 250,
    maxArmor: isHeavy ? 400 : 150,
    thrustPower: isHeavy ? 20000 : 14000,
    turnRate: isHeavy ? 2.0 : 3.0,
    weaponDamage: isHeavy ? 35 : 18,
    weaponCooldown: isHeavy ? 0.2 : 0.3,
  });

  const controller = new AIController(pShip, "pirate");
  engine.addEntity(pShip);
  ais.push(controller);
}

// Generate NPC guards
const guardNames = ["System Guard", "Sector Police", "Navy Destroyer", "Aegis Cruiser", "Defense Sentinel", "Patrol Frigate"];
for (let i = 0; i < 6; i++) {
  const spawnPlanet = planets[i % planets.length];
  const spawnPos = spawnPlanet.position.add(new Vector2D((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200));
  const isDestroyer = i % 2 === 0;

  const gShip = new Ship({
    name: guardNames[i % guardNames.length],
    position: spawnPos,
    velocity: new Vector2D((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
    maxShield: isDestroyer ? 900 : 400,
    maxArmor: isDestroyer ? 600 : 250,
    thrustPower: isDestroyer ? 26000 : 18000,
    turnRate: isDestroyer ? 1.6 : 2.5,
    weaponDamage: isDestroyer ? 45 : 25,
    weaponCooldown: isDestroyer ? 0.3 : 0.25,
  });

  const controller = new AIController(gShip, "guard");
  engine.addEntity(gShip);
  ais.push(controller);
}

// Spark and explosion indicators
engine.onProjectileFired = (proj, ship) => {
  broadcast({
    type: "projectile_fired",
    x: ship.position.x,
    y: ship.position.y,
    heading: ship.heading,
    radius: ship.radius,
    ownerId: ship.id
  });
};

function scheduleAIRespawn(name, role) {
  if (name === "Siege Raider") return;
  setTimeout(() => {
    // Re-create AI with identical parameters
    if (role === "pirate") {
      spawnNPCPirate(Math.floor(Math.random() * pirateNames.length));
    } else if (role === "guard") {
      const spawnPlanet = planets[Math.floor(Math.random() * planets.length)];
      const spawnPos = spawnPlanet.position.add(new Vector2D((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200));
      const gShip = new Ship({
        name: name,
        position: spawnPos,
        velocity: new Vector2D(0,0),
        maxShield: 400,
        maxArmor: 250,
        thrustPower: 18000,
        turnRate: 2.5,
        weaponDamage: 25,
        weaponCooldown: 0.25
      });
      const controller = new AIController(gShip, "guard");
      engine.addEntity(gShip);
      ais.push(controller);
    } else if (role === "merchant") {
      const spawnPlanet = planets[Math.floor(Math.random() * planets.length)];
      const spawnPos = spawnPlanet.position.add(new Vector2D((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400));
      const mShip = new Ship({
        name: name,
        position: spawnPos,
        velocity: new Vector2D(0,0),
        maxShield: 300,
        maxArmor: 200,
        cargoCapacity: 80,
        thrustPower: 11000,
        turnRate: 1.5
      });
      const controller = new AIController(mShip, "merchant");
      engine.addEntity(mShip);
      ais.push(controller);
    }
  }, 10000); // 10 seconds respawn
}

// 3. WebSockets Server Core Implementation
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> clientObj
const fleets = new Map(); // fleetName -> Set<clientObj>
const persistentSessions = new Map(); // sessionToken -> clientObj

wss.on("connection", (ws) => {
  const clientId = "player-" + Math.random().toString(36).substring(2, 9);
  
  const clientObj = {
    ws,
    id: clientId,
    nickname: "Pilot",
    ship: null,
    missionManager: new MissionManager(),
    isLanded: false,
    planetLandedOn: null,
    fleetName: null,
    send(data) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data));
      }
    },
    sendStats() {
      if (!this.ship) return;
      this.send({
        type: "stats",
        credits: this.ship.credits,
        cargo: this.ship.cargo,
        shield: this.ship.shield,
        maxShield: this.ship.maxShield,
        armor: this.ship.armor,
        maxArmor: this.ship.maxArmor,
        name: this.ship.name,
        outfits: this.ship.outfits,
        cargoCapacity: this.ship.cargoCapacity,
        thrustPower: this.ship.thrustPower,
        turnRate: this.ship.turnRate,
        weaponDamage: this.ship.weaponDamage,
        activeMissions: this.missionManager.activeMissions,
        energy: this.ship.energy,
        maxEnergy: this.ship.maxEnergy,
        heat: this.ship.heat,
        maxHeat: this.ship.maxHeat,
        hyperFuel: this.ship.hyperFuel,
        maxHyperFuel: this.ship.maxHyperFuel,
        isOverheated: this.ship.isOverheated,
        isDisabled: this.ship.isDisabled,
      });
    }
  };

  // Wire up mission manager storyline advanced hooks
  clientObj.missionManager.onStorylineStageAdvanced = (mission) => {
    const destPlanet = planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 220;
    const spawnPos = destPlanet.position.add(
      new Vector2D(Math.cos(spawnAngle) * spawnDist, Math.sin(spawnAngle) * spawnDist),
    );

    let bossShip;
    if (mission.stage === 2) {
      bossShip = new Ship({
        name: mission.targetName,
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 500,
        maxArmor: 300,
        thrustPower: 26000,
        turnRate: 2.8,
        weaponDamage: 30,
        weaponCooldown: 0.2,
      });
    } else if (mission.stage === 3) {
      bossShip = new Ship({
        name: mission.targetName,
        position: spawnPos,
        velocity: new Vector2D(0, 0),
        maxShield: 1500,
        maxArmor: 1000,
        thrustPower: 35000,
        turnRate: 1.2,
        weaponDamage: 60,
        weaponCooldown: 0.4,
      });
    }

    const controller = new AIController(bossShip, "pirate");
    engine.addEntity(bossShip);
    ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `STORY ALERT: ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error"
    });
  };

  clientObj.missionManager.onBountyAccepted = (mission) => {
    const destPlanet = planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 200;
    const spawnPos = destPlanet.position.add(
      new Vector2D(Math.cos(spawnAngle) * spawnDist, Math.sin(spawnAngle) * spawnDist),
    );

    const bossShip = new Ship({
      name: mission.targetName,
      position: spawnPos,
      velocity: new Vector2D(0, 0),
      maxShield: 700,
      maxArmor: 450,
      thrustPower: 22000,
      turnRate: 2.2,
      weaponDamage: 40,
      weaponCooldown: 0.22,
    });

    const controller = new AIController(bossShip, "pirate");
    engine.addEntity(bossShip);
    ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `ALERT: Wanted threat ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error"
    });
  };

  clients.set(ws, clientObj);

  ws.on("message", (msgStr) => {
    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch {
      return;
    }

    if (msg.type === "join") {
      const token = msg.sessionToken;

      if (token && persistentSessions.has(token)) {
        const sessionClient = persistentSessions.get(token);
        
        // Clear grace period timeout
        if (sessionClient.cleanupTimeout) {
          clearTimeout(sessionClient.cleanupTimeout);
          sessionClient.cleanupTimeout = null;
        }

        // Re-attach connection to existing session
        sessionClient.ws = ws;
        
        // Update active clients mapping
        clients.delete(ws);
        clients.set(ws, sessionClient);

        // Put the ship back in engine if it was removed
        if (sessionClient.ship) {
          const existing = engine.entities.find(e => e.id === sessionClient.id);
          if (!existing) {
            engine.addEntity(sessionClient.ship);
          }
        }

        // Send init confirmation
        sessionClient.send({
          type: "init",
          playerId: sessionClient.id,
          nickname: sessionClient.nickname,
          sessionToken: token
        });

        sessionClient.send({
          type: "notification",
          message: `Neural link re-established! Welcome back, Commander ${sessionClient.nickname}.`,
          style: "success"
        });

        broadcastNotification(`Commander ${sessionClient.nickname} has re-established neural link!`, "success");
        sessionClient.sendStats();

        // Send bulk markets of all planets to synchronize prices on load
        const bulkMarkets = {};
        for (const p of planets) {
          bulkMarkets[p.name] = p.market;
        }
        sessionClient.send({
          type: "market_bulk_sync",
          markets: bulkMarkets
        });

        // Send active event
        sessionClient.send({
          type: "event_sync",
          event: activeSectorEvent ? {
            type: activeSectorEvent.type,
            planetName: activeSectorEvent.planetName
          } : null
        });

        broadcastRosterUpdate();
        if (sessionClient.fleetName) {
          broadcastFleetUpdate(sessionClient.fleetName);
        }
      } else {
        // Normal New Join Flow
        const sessionToken = clientObj.id; // use clientId as sessionToken
        clientObj.nickname = (msg.name || "Pilot").trim().substring(0, 12);
        
        // Spawning player Starship in space
        const spawnPos = new Vector2D((Math.random() - 0.5) * 150, -150 + (Math.random() - 0.5) * 50);
        const ship = new Ship({
          id: clientObj.id,
          name: clientObj.nickname,
          position: spawnPos,
          velocity: new Vector2D(0, 0),
          heading: -Math.PI / 2,
          maxShield: 200,
          maxArmor: 100,
          credits: 5000,
          cargoCapacity: 20,
          thrustPower: 28000,
          brakePower: 15000,
          maxSpeed: 950,
          turnRate: 3.2,
        });

        clientObj.ship = ship;
        engine.addEntity(ship);

        // Store session
        persistentSessions.set(sessionToken, clientObj);

        // Respond with initial credentials
        clientObj.send({
          type: "init",
          playerId: clientObj.id,
          nickname: clientObj.nickname,
          sessionToken: sessionToken
        });

        clientObj.send({
          type: "notification",
          message: `Welcome aboard Commander ${clientObj.nickname}! Systems nominal.`,
          style: "success"
        });

        broadcastNotification(`${clientObj.nickname} has entered Nebula Sector!`, "info");
        clientObj.sendStats();

        // Send bulk markets of all planets to synchronize prices on load
        const bulkMarkets = {};
        for (const p of planets) {
          bulkMarkets[p.name] = p.market;
        }
        clientObj.send({
          type: "market_bulk_sync",
          markets: bulkMarkets
        });

        // Send active event on join
        clientObj.send({
          type: "event_sync",
          event: activeSectorEvent ? {
            type: activeSectorEvent.type,
            planetName: activeSectorEvent.planetName
          } : null
        });

        broadcastRosterUpdate();
      }
    }

    else if (msg.type === "controls") {
      if (clientObj.ship && !clientObj.isLanded && !clientObj.ship.isDestroyed) {
        clientObj.ship.setControls(msg.controls);
        clientObj.ship.heading = msg.heading;
      }
    }

    else if (msg.type === "land") {
      if (clientObj.ship && !clientObj.isLanded && !clientObj.ship.isDestroyed) {
        const targetPlanet = planets.find((p) => p.canLand(clientObj.ship));
        if (targetPlanet) {
          // Process mission arrivals on server
          const completed = clientObj.missionManager.checkArrivalCompletions(targetPlanet.name, clientObj.ship);
          for (const m of completed) {
            if (clientObj.fleetName) {
              const fleetSet = fleets.get(clientObj.fleetName);
              if (fleetSet && fleetSet.size > 1) {
                const share = Math.floor(m.reward / fleetSet.size);
                // Revert full addition on the local landed player (added inside checkArrivalCompletions)
                clientObj.ship.credits -= m.reward;
                // Add split share to all online fleet members
                for (const member of fleetSet) {
                  if (member.ship) {
                    member.ship.credits += share;
                    member.send({
                      type: "notification",
                      message: `Fleet Contract Completed: ${m.title} by ${clientObj.nickname}! Share: +${share.toLocaleString()} CR`,
                      style: "success"
                    });
                    member.sendStats();
                  }
                }
                continue;
              }
            }

            // Default fallback for solo pilots
            clientObj.send({
              type: "notification",
              message: `Contract Completed: ${m.title}! Received +${m.reward.toLocaleString()} CR`,
              style: "success"
            });
          }

          // Security scans for contraband
          if (targetPlanet.name !== "Rogue's Hollow" && clientObj.ship.cargo.contraband > 0) {
            clientObj.ship.cargo.contraband = 0;
            clientObj.ship.credits = Math.max(0, clientObj.ship.credits - 1500);
            clientObj.send({
              type: "notification",
              message: "Security Scan: Contraband detected! Confiscated and fined 1,500 CR.",
              style: "error"
            });
          }

          clientObj.isLanded = true;
          clientObj.planetLandedOn = targetPlanet;
          clientObj.ship.velocity = new Vector2D(0, 0);
          clientObj.ship.clearControls();
          clientObj.ship.hyperFuel = clientObj.ship.maxHyperFuel; // Refuel hyper-fuel tank on landing (Endless Sky fuel system)
          engine.removeEntity(clientObj.id); // temporarily take out of orbit simulation

          clientObj.send({
            type: "landed",
            planetName: targetPlanet.name,
          });
          clientObj.send({
            type: "notification",
            message: `Landed safely on ${targetPlanet.name}. Ship systems secured.`,
            style: "success"
          });
          clientObj.sendStats();
          broadcastRosterUpdate();
        } else {
          clientObj.send({
            type: "notification",
            message: "Cannot land here. Travel within trigger radius at low speed (< 80 u/s).",
            style: "error"
          });
        }
      }
    }

    else if (msg.type === "launch") {
      if (clientObj.ship && clientObj.isLanded) {
        const p = clientObj.planetLandedOn;
        clientObj.isLanded = false;
        clientObj.planetLandedOn = null;

        // Position slightly outside orbit
        clientObj.ship.position = p.position.add(new Vector2D(0, p.landingRadius + 40));
        clientObj.ship.velocity = new Vector2D(0, 0);
        clientObj.ship.clearControls();
        engine.addEntity(clientObj.ship);

        clientObj.send({ type: "launched" });
        clientObj.send({
          type: "notification",
          message: "Launch sequence completed! Thrusters online.",
          style: "success"
        });
        clientObj.sendStats();
        broadcastRosterUpdate();
      }
    }

    else if (msg.type === "trade") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn) {
        const p = clientObj.planetLandedOn;
        const price = p.market[msg.item];
        if (!price) return;

        if (msg.action === "buy") {
          if (clientObj.ship.credits < price) {
            clientObj.send({ type: "notification", message: "Insufficient credits!", style: "error" });
            return;
          }
          if (clientObj.ship.addCargo(msg.item, 1)) {
            clientObj.ship.credits -= price;

            // Price moves up by 2.2% due to demand
            const basePrice = (BASE_MARKETS[p.name] && BASE_MARKETS[p.name][msg.item]) || 150;
            const currentPrice = p.market[msg.item];
            p.market[msg.item] = Math.min(Math.round(basePrice * 2.5), Math.round(currentPrice * 1.022));

            clientObj.send({
              type: "notification",
              message: `Purchased 1 ton of ${msg.item} for ${price} CR`,
              style: "success"
            });
            clientObj.sendStats();
            broadcast({
              type: "market_sync",
              planetName: p.name,
              market: p.market
            });
          } else {
            clientObj.send({ type: "notification", message: "Cargo hold is full!", style: "error" });
          }
        } else if (msg.action === "sell") {
          if (clientObj.ship.removeCargo(msg.item, 1)) {
            clientObj.ship.credits += price;

            // Price moves down by 1.8% due to supply surplus
            const basePrice = (BASE_MARKETS[p.name] && BASE_MARKETS[p.name][msg.item]) || 150;
            const currentPrice = p.market[msg.item];
            p.market[msg.item] = Math.max(Math.round(basePrice * 0.4), Math.round(currentPrice * 0.982));

            clientObj.send({
              type: "notification",
              message: `Sold 1 ton of ${msg.item} for ${price} CR`,
              style: "success"
            });
            clientObj.sendStats();
            broadcast({
              type: "market_sync",
              planetName: p.name,
              market: p.market
            });
          } else {
            clientObj.send({ type: "notification", message: `No ${msg.item} in cargo bay!`, style: "error" });
          }
        }
      }
    }

    else if (msg.type === "outfit_buy") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn) {
        const p = clientObj.planetLandedOn;
        const outfit = p.outfitter.find((o) => o.name === msg.outfitName);
        if (!outfit) return;

        if (clientObj.ship.outfits.includes(outfit.name)) {
          clientObj.send({ type: "notification", message: "Upgrade already equipped!", style: "error" });
          return;
        }

        if (clientObj.ship.credits < outfit.cost) {
          clientObj.send({ type: "notification", message: "Insufficient credits for upgrade!", style: "error" });
          return;
        }

        clientObj.ship.credits -= outfit.cost;
        clientObj.ship.outfits.push(outfit.name);

        // Apply upgrades authoritatively
        if (outfit.type === "shield") {
          clientObj.ship.maxShield += outfit.value;
          clientObj.ship.shield = clientObj.ship.maxShield;
        } else if (outfit.type === "engine") {
          clientObj.ship.thrustPower += outfit.value;
          clientObj.ship.maxSpeed += 50;
        } else if (outfit.type === "weapon") {
          clientObj.ship.weaponDamage += outfit.value;
        } else if (outfit.type === "cargo") {
          clientObj.ship.cargoCapacity += outfit.value;
        } else if (outfit.type === "reactor") {
          clientObj.ship.energyRegen += outfit.value;
        } else if (outfit.type === "radiator") {
          clientObj.ship.heatDissipation += outfit.value;
        } else if (outfit.type === "capacitor") {
          clientObj.ship.maxEnergy += outfit.value;
          clientObj.ship.energy = clientObj.ship.maxEnergy;
        }

        clientObj.send({
          type: "notification",
          message: `Equipped: ${outfit.name}!`,
          style: "success"
        });
        clientObj.sendStats();
      }
    }

    else if (msg.type === "ship_buy") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn) {
        const p = clientObj.planetLandedOn;
        const s = p.shipyard.find((sh) => sh.name === msg.shipName);
        if (!s) return;

        if (clientObj.ship.credits < s.cost) {
          clientObj.send({ type: "notification", message: "Insufficient credits for ship purchase!", style: "error" });
          return;
        }

        clientObj.ship.credits -= s.cost;
        clientObj.ship.name = s.name;

        // Apply upgrades authoritatively
        clientObj.ship.maxShield = s.maxShield;
        clientObj.ship.shield = s.maxShield;
        clientObj.ship.maxArmor = s.maxArmor;
        clientObj.ship.armor = s.maxArmor;
        clientObj.ship.cargoCapacity = s.cargoCapacity;
        clientObj.ship.thrustPower = s.thrustPower;
        clientObj.ship.turnRate = s.turnRate;

        // Reset cargo
        clientObj.ship.cargo = { food: 0, electronics: 0, minerals: 0, luxuries: 0, contraband: 0, machinery: 0 };

        clientObj.send({
          type: "notification",
          message: `Acquired new ship: ${s.name}!`,
          style: "success"
        });
        clientObj.sendStats();
      }
    }

    else if (msg.type === "mission_accept") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn) {
        // Ensure availability of missions
        if (!clientObj.missionManager.availableMissions[msg.planetName]) {
          clientObj.missionManager.generateMissionsForPlanet(msg.planetName, planets);
        }

        const res = clientObj.missionManager.acceptMission(msg.planetName, msg.missionId, clientObj.ship);
        if (res.success) {
          clientObj.send({ type: "notification", message: res.message, style: "success" });
          clientObj.sendStats();
        } else {
          clientObj.send({ type: "notification", message: res.message, style: "error" });
        }
      }
    }

    else if (msg.type === "mission_abandon") {
      if (clientObj.ship) {
        const activeM = clientObj.missionManager.activeMissions.find(m => m.id === msg.missionId);
        if (activeM) {
          clientObj.missionManager.abandonMission(msg.missionId, clientObj.ship);
          clientObj.send({ type: "notification", message: `Abandoned contract: ${activeM.title}`, style: "info" });
          clientObj.sendStats();
        }
      }
    }

    else if (msg.type === "fleet_create" || msg.type === "fleet_join") {
      const code = (msg.fleetName || "").toUpperCase().trim().substring(0, 10);
      if (!code) {
        clientObj.send({ type: "notification", message: "Invalid Fleet Code!", style: "error" });
        return;
      }

      // Leave old fleet first
      leaveCurrentFleet(clientObj);

      clientObj.fleetName = code;
      if (!fleets.has(code)) {
        fleets.set(code, new Set());
      }
      fleets.get(code).add(clientObj);

      clientObj.send({
        type: "notification",
        message: `Joined fleet: ${code}`,
        style: "success"
      });

      broadcastFleetUpdate(code);
      broadcastRosterUpdate();
    }

    else if (msg.type === "fleet_leave") {
      if (clientObj.fleetName) {
        const oldCode = clientObj.fleetName;
        leaveCurrentFleet(clientObj);
        clientObj.send({
          type: "notification",
          message: `Left fleet: ${oldCode}`,
          style: "info"
        });
        broadcastRosterUpdate();
      }
    }

    else if (msg.type === "chat") {
      const channel = msg.channel || "global";
      const text = (msg.text || "").trim().substring(0, 100);
      if (!text) return;

      if (channel === "fleet") {
        if (!clientObj.fleetName) {
          clientObj.send({
            type: "notification",
            message: "You are not in a fleet! Join a fleet to use Fleet comms.",
            style: "error"
          });
          return;
        }

        const fleetSet = fleets.get(clientObj.fleetName);
        if (fleetSet) {
          const chatPayload = {
            type: "chat",
            channel: "fleet",
            sender: clientObj.nickname,
            text: text
          };
          for (const member of fleetSet) {
            member.send(chatPayload);
          }
        }
      } else {
        // Global comms
        const chatPayload = {
          type: "chat",
          channel: "global",
          sender: clientObj.nickname,
          text: text
        };
        for (const c of clients.values()) {
          c.send(chatPayload);
        }
      }
    }

    else if (msg.type === "warp_jump") {
      const gate = engine.getEntity(msg.gateId);
      if (!gate || gate.type !== "warp_gate") {
        clientObj.send({ type: "notification", message: "Warp Gate invalid or not found!", style: "error" });
        return;
      }
      const dist = clientObj.ship.position.distance(gate.position);
      if (dist > 150) {
        clientObj.send({ type: "notification", message: "Too far from stargate to initiate warp jump! Move within 150u.", style: "error" });
        return;
      }
      if (clientObj.ship.hyperFuel < 20) {
        clientObj.send({ type: "notification", message: "Insufficient Hyper-Fuel! Requires 20 units. Land on a planet to refuel.", style: "error" });
        return;
      }

      // Deduct fuel, warp ship coordinates
      clientObj.ship.hyperFuel = Math.max(0, clientObj.ship.hyperFuel - 20);
      clientObj.ship.position = gate.targetPosition.clone();
      clientObj.ship.velocity.set(0, 0); // halt drift momentum to avoid launching offscreen

      // Sync the warp success with the client
      clientObj.send({
        type: "warp_success",
        targetSector: gate.targetSector,
        position: { x: gate.targetPosition.x, y: gate.targetPosition.y },
        hyperFuel: clientObj.ship.hyperFuel
      });

      clientObj.send({
        type: "notification",
        message: `Hyperspace drive engaged! Warp transition to ${gate.targetSector.toUpperCase()} Sector completed.`,
        style: "success"
      });

      // Move associated escorts with flagship
      let escortCount = 0;
      for (const ai of ais) {
        if (ai.role === "escort" && ai.flagship === clientObj.ship) {
          ai.ship.position = gate.targetPosition.add(new Vector2D((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100));
          ai.ship.velocity.set(0, 0);
          escortCount++;
        }
      }
      if (escortCount > 0) {
        clientObj.send({
          type: "notification",
          message: `${escortCount} AI escorts made the hyperspace jump with you.`,
          style: "info"
        });
      }

      clientObj.sendStats();
      broadcastRosterUpdate();
    }

    else if (msg.type === "boarding_action") {
      const target = engine.getEntity(msg.targetId);
      if (!target || target.type !== "ship" || !target.isDisabled) {
        clientObj.send({ type: "notification", message: "Target invalid or not disabled!", style: "error" });
        return;
      }
      const dist = clientObj.ship.position.distance(target.position);
      if (dist > 250) {
        clientObj.send({ type: "notification", message: "Target too far for boarding! Move within 250u.", style: "error" });
        return;
      }

      if (msg.action === "plunder") {
        let plunderedCount = 0;
        if (target.cargo) {
          for (const [commodity, amount] of Object.entries(target.cargo)) {
            if (amount > 0) {
              for (let i = 0; i < amount; i++) {
                if (clientObj.ship.addCargo(commodity, 1)) {
                  target.cargo[commodity]--;
                  plunderedCount++;
                }
              }
            }
          }
        }
        if (plunderedCount > 0) {
          clientObj.send({ type: "notification", message: `Success! Plundered ${plunderedCount} tons of commodities.`, style: "success" });
          clientObj.sendStats();
        } else {
          clientObj.send({ type: "notification", message: "Plunder complete: target hold was empty or your cargo bay is full.", style: "info" });
        }
      }

      else if (msg.action === "salvage") {
        const salvagable = target.outfits ? target.outfits.filter(o => !clientObj.ship.outfits.includes(o)) : [];
        if (salvagable.length > 0) {
          const chosen = salvagable[Math.floor(Math.random() * salvagable.length)];
          clientObj.ship.outfits.push(chosen);
          
          // Apply upgrade authoritatively on salvage
          const defaultCatalog = [
            { name: "Heavy Shields", cost: 1200, type: "shield", value: 350 },
            { name: "Aegis Shield Matrix", cost: 4500, type: "shield", value: 800 },
            { name: "Overcharged Engines", cost: 1500, type: "engine", value: 12000 },
            { name: "Hyper-Drive Thrusters", cost: 3800, type: "engine", value: 25000 },
            { name: "Plasma Cannon", cost: 1800, type: "weapon", value: 25 },
            { name: "Neutron Blaster", cost: 4200, type: "weapon", value: 55 },
            { name: "Expanded Cargo Holds", cost: 1000, type: "cargo", value: 15 },
            { name: "Sub-space Cargo Compressor", cost: 2800, type: "cargo", value: 45 },
            { name: "Tractor Beam Matrix", cost: 2500, type: "tractor", value: 250 },
            { name: "Cold-Fusion Reactor", cost: 3000, type: "reactor", value: 30 },
            { name: "Cryo-Cooling Radiator", cost: 2200, type: "radiator", value: 15 },
            { name: "Supercapacitor Cells", cost: 1600, type: "capacitor", value: 100 }
          ];
          const match = defaultCatalog.find(o => o.name === chosen);
          if (match) {
            if (match.type === "shield") {
              clientObj.ship.maxShield += match.value;
              clientObj.ship.shield = clientObj.ship.maxShield;
            } else if (match.type === "engine") {
              clientObj.ship.thrustPower += match.value;
              clientObj.ship.maxSpeed += 50;
            } else if (match.type === "weapon") {
              clientObj.ship.weaponDamage += match.value;
            } else if (match.type === "cargo") {
              clientObj.ship.cargoCapacity += match.value;
            } else if (match.type === "reactor") {
              clientObj.ship.energyRegen += match.value;
            } else if (match.type === "radiator") {
              clientObj.ship.heatDissipation += match.value;
            } else if (match.type === "capacitor") {
              clientObj.ship.maxEnergy += match.value;
              clientObj.ship.energy = clientObj.ship.maxEnergy;
            }
          }

          clientObj.send({ type: "notification", message: `Hull Component Salvaged! Equipped: ${chosen}`, style: "success" });
          clientObj.sendStats();
        } else {
          clientObj.ship.credits += 800;
          clientObj.send({ type: "notification", message: "No new modules found. Salvaged hull scrap for +800 CR.", style: "info" });
          clientObj.sendStats();
        }
      }

      else if (msg.action === "capture") {
        const fee = 1500;
        if (clientObj.ship.credits < fee) {
          clientObj.send({ type: "notification", message: "Insufficient credits for escort crew fees (1,500 CR required)!", style: "error" });
          return;
        }
        clientObj.ship.credits -= fee;

        target.isDisabled = false;
        target.armor = Math.floor(target.maxArmor * 0.4);
        target.shield = 0;
        target.name = `${clientObj.nickname}'s Escort`;

        const controller = new AIController(target, "escort");
        controller.flagship = clientObj.ship;
        ais.push(controller);

        clientObj.send({ type: "notification", message: `Neural Command Link Established! Escort active.`, style: "success" });
        clientObj.sendStats();
      }

      else if (msg.action === "scuttle") {
        const scrapReward = Math.floor(target.maxArmor * 4 + Math.random() * 200);
        clientObj.ship.credits += scrapReward;

        engine.removeEntity(target.id);

        clientObj.send({ type: "notification", message: `Hull scuttled. Salvaged scraps for +${scrapReward} CR`, style: "success" });
        clientObj.sendStats();
      }

      broadcastRosterUpdate();
    }

    else if (msg.type === "escort_command") {
      const cmd = msg.command; // "follow", "hold", "attack"
      let count = 0;
      for (const ai of ais) {
        if (ai.role === "escort" && ai.flagship === clientObj.ship) {
          ai.escortMode = cmd;
          count++;
        }
      }
      clientObj.send({ type: "notification", message: `Transmitted [${cmd.toUpperCase()}] commands to ${count} AI wingmen.`, style: "success" });
    }

    else if (msg.type === "ping") {
      clientObj.send({
        type: "pong",
        time: msg.time
      });
    }
  });

  ws.on("close", () => {
    const activeClient = clients.get(ws) || clientObj;
    
    // Set a 30-second neural link grace period before purging
    activeClient.cleanupTimeout = setTimeout(() => {
      // Actually purge the player session
      leaveCurrentFleet(activeClient);
      if (activeClient.ship) {
        engine.removeEntity(activeClient.id);
      }
      persistentSessions.delete(activeClient.id);
      broadcastNotification(`${activeClient.nickname} has left the sector (neural link lost).`, "info");
      broadcastRosterUpdate();
    }, 30000); // 30 seconds

    clients.delete(ws);
    broadcastNotification(`${activeClient.nickname} neural link disconnected. Standby recovery mode active...`, "warning");
    broadcastRosterUpdate();
  });
});

function leaveCurrentFleet(clientObj) {
  if (!clientObj.fleetName) return;
  const code = clientObj.fleetName;
  const set = fleets.get(code);
  if (set) {
    set.delete(clientObj);
    if (set.size === 0) {
      fleets.delete(code);
    } else {
      broadcastFleetUpdate(code);
    }
  }
  clientObj.fleetName = null;
  clientObj.send({ type: "fleet_sync", name: null, members: [] });
}

function broadcastFleetUpdate(fleetCode) {
  const set = fleets.get(fleetCode);
  if (!set) return;

  const membersArray = Array.from(set).map(m => ({
    id: m.id,
    nickname: m.nickname,
    shield: m.ship ? m.ship.shield : 0,
    maxShield: m.ship ? m.ship.maxShield : 200,
    armor: m.ship ? m.ship.armor : 0,
    maxArmor: m.ship ? m.ship.maxArmor : 100,
    x: m.ship ? Math.round(m.ship.position.x) : 0,
    y: m.ship ? Math.round(m.ship.position.y) : 0,
    isLanded: m.isLanded,
    landedOn: m.planetLandedOn ? m.planetLandedOn.name : null
  }));

  for (const m of set) {
    m.send({
      type: "fleet_sync",
      name: fleetCode,
      members: membersArray
    });
  }
}

function broadcast(data) {
  const str = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(str);
    }
  }
}

function broadcastNotification(message, style = "info") {
  broadcast({
    type: "notification",
    message,
    style
  });
}

function serializeEntities() {
  return engine.entities
    .filter(ent => ent.type !== "planet")
    .map(ent => {
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
        base.targetPosition = ent.targetPosition ? { x: ent.targetPosition.x, y: ent.targetPosition.y } : null;
      }
      return base;
    });
}

// 4. Seeding physics tick loop (30Hz)
const TICK_RATE = 30;
const dt = 1 / TICK_RATE;

setInterval(() => {
  // A. Drive AI merchant itineraries and update active AIs
  for (const ai of ais) {
    if (ai.ship.isDestroyed) continue;
    
    if (ai.role === "merchant" && !ai.destination) {
      const potentialHubs = planets.filter((p) => p.position.distance(ai.ship.position) > 250);
      if (potentialHubs.length > 0) {
        const nextHub = potentialHubs[Math.floor(Math.random() * potentialHubs.length)];
        ai.destination = nextHub.position.clone();
      }
    }
    ai.update(dt, engine.entities);
  }

  // B. Advance Newtonian kinematics, elastic rebounds, and laser damage
  const originalRegens = new Map();
  if (activeSectorEvent && activeSectorEvent.type === "emp") {
    const empPlanet = planets.find(p => p.name === activeSectorEvent.planetName);
    if (empPlanet) {
      for (const ent of engine.entities) {
        if (ent.type === "ship" && !ent.isDestroyed) {
          const dist = ent.position.distance(empPlanet.position);
          if (dist <= 400) {
            originalRegens.set(ent, ent.shieldRegen);
            ent.shieldRegen = 0;
          }
        }
      }
    }
  }

  // Apply Tractor Beam Matrix pull forces
  for (const ent of engine.entities) {
    if (ent.type === "ship" && !ent.isDestroyed) {
      if (ent.outfits && ent.outfits.includes("Tractor Beam Matrix")) {
        for (const pod of engine.entities) {
          if (pod.type === "cargo_pod") {
            const toShip = ent.position.subtract(pod.position);
            const dist = toShip.magnitude();
            if (dist > 1 && dist <= 250) {
              const forceMag = 400000 / (dist * dist + 100);
              const pullForce = toShip.normalize().multiply(forceMag * pod.mass);
              pod.applyForce(pullForce);
            }
          }
        }
      }
    }
  }

  // Handle CargoPod collisions and collection ingestion
  const podsToRemove = [];
  for (const pod of engine.entities) {
    if (pod.type === "cargo_pod") {
      for (const ship of engine.entities) {
        if (ship.type === "ship" && !ship.isDestroyed) {
          const dist = ship.position.distance(pod.position);
          if (dist <= ship.radius + pod.radius) {
            // Check cargo holds capacity limits
            const success = ship.addCargo(pod.resourceType, pod.amount);
            if (success) {
              podsToRemove.push(pod);
              const client = Array.from(clients.values()).find(c => c.ship === ship);
              if (client) {
                client.send({
                  type: "notification",
                  message: `+${pod.amount} ${pod.resourceType.toUpperCase()} collected!`,
                  style: "success"
                });
                client.send({
                  type: "cargo_pickup",
                  resourceType: pod.resourceType,
                  amount: pod.amount,
                  x: pod.position.x,
                  y: pod.position.y
                });
                client.sendStats();
              }
              break;
            } else {
              // Throttled cargo hold full notification alerts
              const client = Array.from(clients.values()).find(c => c.ship === ship);
              if (client && (!ship.lastCargoFullAlert || Date.now() - ship.lastCargoFullAlert > 2000)) {
                ship.lastCargoFullAlert = Date.now();
                client.send({
                  type: "notification",
                  message: "Cargo bay is FULL! Upgrade cargo holds or sell commodities.",
                  style: "error"
                });
              }
            }
          }
        }
      }
    }
  }

  for (const pod of podsToRemove) {
    engine.removeEntity(pod);
  }

  // Apply Nebula Hazards: Drag & Shield Dampening
  for (const ent of engine.entities) {
    if (ent.type === "ship" && !ent.isDestroyed) {
      let activeNebula = null;
      for (const neb of NEBULAE) {
        const dx = ent.position.x - neb.position.x;
        const dy = ent.position.y - neb.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= neb.radius) {
          activeNebula = neb;
          break;
        }
      }

      if (activeNebula) {
        // 1. Scale linear drag: Apply extra drag force
        if (engine.globalDrag > 0 && ent.velocity.magnitude() > 0) {
          const extraDragCoef = activeNebula.dragMultiplier - 1.0;
          const extraDragForce = ent.velocity.multiply(
            -extraDragCoef * engine.globalDrag * ent.mass
          );
          ent.applyForce(extraDragForce);
        }

        // 2. Shield Dampening hazard
        if (activeNebula.hazardType === "shield_dampen") {
          const currentRegen = originalRegens.has(ent) ? 0 : ent.shieldRegen;
          if (!originalRegens.has(ent)) {
            originalRegens.set(ent, ent.shieldRegen);
          }
          ent.shieldRegen = currentRegen * 0.5; // Cut shield regen by 50%
        }
      }
    }
  }

  engine.update(dt);

  // Restore original shield regeneration rates immediately after engine update
  for (const [ship, origRegen] of originalRegens.entries()) {
    ship.shieldRegen = origRegen;
  }

  // C. Space Entity Spawning replenishment bounds check
  const activeAsteroids = engine.entities.filter(e => e.type === "generic" || e.type === "gem_asteroid");
  if (activeAsteroids.length < 35) {
    spawnNewAsteroid(false);
  }

  // D. Update all active fleets' coords and stats periodically
  for (const code of fleets.keys()) {
    broadcastFleetUpdate(code);
  }

  // E. Broadcast current universe state
  const serialized = serializeEntities();
  for (const client of clients.values()) {
    client.send({
      type: "state",
      entities: serialized,
    });
  }
}, 1000 / TICK_RATE);

// 5. Physics collisions events triggers
engine.onEntityDestroyed = (ent) => {
  if (ent.type === "projectile") return;

  const killerId = ent.destroyedBy;
  const killerClient = killerId ? Array.from(persistentSessions.values()).find(c => c.id === killerId) : null;
  let killerFleetMembers = null;

  if (killerClient && killerClient.fleetName) {
    killerFleetMembers = Array.from(persistentSessions.values()).filter(c => c.fleetName === killerClient.fleetName);
  }

  // --- Asteroids destroyed ---
  if (ent.type === "generic" || ent.type === "gem_asteroid") {
    const isGem = ent.type === "gem_asteroid";
    const count = isGem ? (Math.floor(Math.random() * 2) + 2) : (Math.floor(Math.random() * 2) + 1);
    const resource = isGem ? "luxuries" : "minerals";

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 50;
      const podVel = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed).add(ent.velocity);
      
      const pod = new CargoPod({
        resourceType: resource,
        amount: 1,
        position: ent.position.clone(),
        velocity: podVel
      });
      engine.addEntity(pod);
    }
  }

  // --- Ships destroyed ---
  else if (ent.type === "ship") {
    const isPirate = ent.name === "Pirate Raider" || ent.name.includes("Pirate") || ent.name.includes("Raider");
    
    // Check bounties for connected and standby clients
    for (const client of persistentSessions.values()) {
      const completedBounty = client.missionManager.checkBountyCompletion(ent.name, client.ship);
      if (completedBounty) {
        if (client.fleetName) {
          const fleetSet = fleets.get(client.fleetName);
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
                    style: "success"
                  });
                } else if (completedBounty.stageAdvanced) {
                  member.send({
                    type: "notification",
                    message: `Fleet Story Stage Completed: ${completedBounty.title}! Share: +${share.toLocaleString()} CR`,
                    style: "success"
                  });
                } else {
                  member.send({
                    type: "notification",
                    message: `Fleet Bounty Claimed: ${completedBounty.title} by ${client.nickname}! Share: +${share.toLocaleString()} CR`,
                    style: "success"
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
          client.send({ type: "notification", message: completedBounty.message, style: "success" });
        } else if (completedBounty.stageAdvanced) {
          client.send({ type: "notification", message: completedBounty.message, style: "success" });
        } else {
          client.send({
            type: "notification",
            message: `Contract Completed: Bounty for ${completedBounty.targetName} claimed! +${completedBounty.reward.toLocaleString()} CR`,
            style: "success"
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
        const podVel = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed).add(ent.velocity);
        const resource = lootTypes[Math.floor(Math.random() * lootTypes.length)];
        
        const pod = new CargoPod({
          resourceType: resource,
          amount: 1,
          position: ent.position.clone(),
          velocity: podVel
        });
        engine.addEntity(pod);
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
              style: "success"
            });
            member.sendStats();
          }
        } else {
          killerClient.ship.credits += rewardBase;
          killerClient.send({
            type: "notification",
            message: `${ent.name} neutralized! Bounty claimed +1,000 CR`,
            style: "success"
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
            const podVel = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed).add(ent.velocity);
            
            const pod = new CargoPod({
              resourceType: resource,
              amount: 1,
              position: ent.position.clone(),
              velocity: podVel
            });
            engine.addEntity(pod);
          }
        }
      }
      broadcastNotification(`${ent.name} has been destroyed in combat.`, "info");

      // Check if it's a player ship and respawn them
      const deadClient = Array.from(persistentSessions.values()).find(c => c.ship === ent);
      if (deadClient) {
        handlePlayerRespawnServer(deadClient);
      }
    }

    // Only schedule AI respawn if it is NOT a player ship
    const isPlayerShip = Array.from(persistentSessions.values()).some(c => c.ship === ent);
    if (!isPlayerShip) {
      scheduleAIRespawn(ent.name, ent.role);
    }
  }
};

function handlePlayerRespawnServer(client) {
  client.send({
    type: "notification",
    message: "CRITICAL ERROR: Reactor core compromised! Ejecting capsule...",
    style: "error"
  });

  setTimeout(() => {
    const fee = Math.floor(client.ship.credits * 0.1);
    client.ship.credits = Math.max(0, client.ship.credits - fee);

    client.ship.armor = client.ship.maxArmor;
    client.ship.shield = client.ship.maxShield;
    client.ship.position = new Vector2D(0, -150);
    client.ship.velocity = new Vector2D(0, 0);
    client.ship.heading = -Math.PI / 2;
    client.ship.clearControls();

    engine.addEntity(client.ship);

    client.send({
      type: "notification",
      message: `Cloned replacement hull activated at Sol. Insurance fee: ${fee.toLocaleString()} CR.`,
      style: "info"
    });
    client.sendStats();
  }, 3000);
}

function broadcastRosterUpdate() {
  const roster = [];
  for (const sessionClient of persistentSessions.values()) {
    roster.push({
      id: sessionClient.id,
      nickname: sessionClient.nickname,
      credits: sessionClient.ship ? sessionClient.ship.credits : 0,
      fleetName: sessionClient.fleetName,
      status: sessionClient.cleanupTimeout ? "standby" : (sessionClient.isLanded ? "docked" : "orbit")
    });
  }

  const payload = {
    type: "lobby_sync",
    count: persistentSessions.size,
    roster: roster
  };

  for (const client of clients.values()) {
    client.send(payload);
  }
}

// Economic market self-normalization ticker (every 6 seconds, prices settle toward baselines by 0.5% or 1 CR)
setInterval(() => {
  for (const p of planets) {
    const base = BASE_MARKETS[p.name];
    if (!base) continue;

    let planetChanged = false;
    for (const item of Object.keys(p.market)) {
      // If an active event is overriding this item, do not normalize it yet!
      if (activeEconomicEvent && activeEconomicEvent.planetName === p.name && activeEconomicEvent.commodity === item) {
        continue;
      }

      const current = p.market[item];
      const baseline = base[item];
      if (current !== baseline) {
        const diff = baseline - current;
        // Step 1 CR minimum, or 0.5% of baseline
        const step = Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.005));
        p.market[item] = current + step;
        planetChanged = true;
      }
    }

    if (planetChanged) {
      broadcast({
        type: "market_sync",
        planetName: p.name,
        market: p.market
      });
    }
  }
}, 6000);

// 6. Start listening
server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`    NEBULA SECTOR AUTHORITATIVE MULTIPLAYER SERVER LISTENING    `);
  console.log(`    PORT: ${PORT} | Mode: Authoritative co-op sandboxing        `);
  console.log(`    URL: http://localhost:${PORT}                              `);
  console.log(`================================================================`);
});
