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
const solPlanet = new Planet({
  name: "Sol",
  description: "The historic cradle of humanity and bustling trade center of the inner systems. High luxury demand, cheap machinery.",
  color: "#4d6fff",
  position: new Vector2D(0, 0),
  radius: 65,
  market: { food: 100, electronics: 300, minerals: 150, luxuries: 600, contraband: 250, machinery: 100 }
});
planets.push(solPlanet);
engine.addEntity(solPlanet);

const polarisPlanet = new Planet({
  name: "New Polaris",
  description: "An icy frontier industrial colony rich in raw mineral extractions. High food demand, cheap raw minerals.",
  color: "#e0f7fa",
  position: new Vector2D(2000, -1200),
  radius: 55,
  market: { food: 220, electronics: 320, minerals: 50, luxuries: 650, contraband: 300, machinery: 220 }
});
planets.push(polarisPlanet);
engine.addEntity(polarisPlanet);

const draconisPlanet = new Planet({
  name: "Sigma Draconis",
  description: "A high-tech research outpost specializing in advanced electronics production. Demands minerals, cheap electronics.",
  color: "#00f2fe",
  position: new Vector2D(-2200, 1600),
  radius: 60,
  market: { food: 120, electronics: 120, minerals: 250, luxuries: 500, contraband: 200, machinery: 160 }
});
planets.push(draconisPlanet);
engine.addEntity(draconisPlanet);

const kaelisPlanet = new Planet({
  name: "Kaelis Colony",
  description: "An agricultural breadbasket producing vast food supplies. Demands electronics, cheap food.",
  color: "#00e676",
  position: new Vector2D(-1800, -1800),
  radius: 60,
  market: { food: 40, electronics: 420, minerals: 180, luxuries: 550, contraband: 280, machinery: 190 }
});
planets.push(kaelisPlanet);
engine.addEntity(kaelisPlanet);

const aureliaPlanet = new Planet({
  name: "Aurelia Mining Hub",
  description: "Outer planetary asteroid refinery. Demands food, produces cheap raw metals and machinery.",
  color: "#ff9100",
  position: new Vector2D(1800, 1800),
  radius: 58,
  market: { food: 150, electronics: 290, minerals: 70, luxuries: 580, contraband: 260, machinery: 150 }
});
planets.push(aureliaPlanet);
engine.addEntity(aureliaPlanet);

const tenebrisPlanet = new Planet({
  name: "Tenebris Prime",
  description: "A mysterious colony inside a dark nebula. Produces top-tier scientific luxuries, demands electronics.",
  color: "#d500f9",
  position: new Vector2D(-600, 2400),
  radius: 55,
  market: { food: 160, electronics: 450, minerals: 200, luxuries: 220, contraband: 400, machinery: 240 }
});
planets.push(tenebrisPlanet);
engine.addEntity(tenebrisPlanet);

const valkyriePlanet = new Planet({
  name: "Valkyrie Depot",
  description: "Core fleet military staging area. Produces high-grade heavy machinery, demands electronics.",
  color: "#ff1744",
  position: new Vector2D(2500, 300),
  radius: 62,
  market: { food: 110, electronics: 380, minerals: 190, luxuries: 520, contraband: 220, machinery: 80 }
});
planets.push(valkyriePlanet);
engine.addEntity(valkyriePlanet);

const roguesPlanet = new Planet({
  name: "Rogue's Hollow",
  description: "A lawless pirate anchorage hidden deep inside a dense asteroid field. Smuggler contraband is cheap here.",
  color: "#e040fb",
  position: new Vector2D(-2800, -500),
  radius: 52,
  market: { food: 250, electronics: 220, minerals: 160, luxuries: 450, contraband: 60, machinery: 180 }
});
planets.push(roguesPlanet);
engine.addEntity(roguesPlanet);

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
      clientObj.nickname = (msg.name || "Pilot").trim().substring(0, 12);
      
      // Spawning player Starship in space
      const spawnPos = new Vector2D((Math.random() - 0.5) * 150, -150 + (Math.random() - 0.5) * 50);
      const ship = new Ship({
        id: clientId,
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

      // Respond with initial credentials
      clientObj.send({
        type: "init",
        playerId: clientId,
        nickname: clientObj.nickname
      });

      clientObj.send({
        type: "notification",
        message: `Welcome aboard Commander ${clientObj.nickname}! Systems nominal.`,
        style: "success"
      });

      broadcastNotification(`${clientObj.nickname} has entered Nebula Sector!`, "info");
      clientObj.sendStats();
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
            clientObj.send({
              type: "notification",
              message: `Purchased 1 ton of ${msg.item} for ${price} CR`,
              style: "success"
            });
            clientObj.sendStats();
          } else {
            clientObj.send({ type: "notification", message: "Cargo hold is full!", style: "error" });
          }
        } else if (msg.action === "sell") {
          if (clientObj.ship.removeCargo(msg.item, 1)) {
            clientObj.ship.credits += price;
            clientObj.send({
              type: "notification",
              message: `Sold 1 ton of ${msg.item} for ${price} CR`,
              style: "success"
            });
            clientObj.sendStats();
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
  });

  ws.on("close", () => {
    leaveCurrentFleet(clientObj);
    if (clientObj.ship) {
      engine.removeEntity(clientId);
    }
    clients.delete(ws);
    broadcastNotification(`${clientObj.nickname} has left the sector.`, "info");
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
        x: ent.position.x,
        y: ent.position.y,
        vx: ent.velocity.x,
        vy: ent.velocity.y,
        heading: ent.heading,
        radius: ent.radius,
      };

      if (ent.type === "ship") {
        base.name = ent.name;
        base.shield = ent.shield;
        base.maxShield = ent.maxShield;
        base.armor = ent.armor;
        base.maxArmor = ent.maxArmor;
        base.controls = ent.controls;
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
  engine.update(dt);

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
  const killerClient = killerId ? Array.from(clients.values()).find(c => c.id === killerId) : null;
  let killerFleetMembers = null;

  if (killerClient && killerClient.fleetName) {
    killerFleetMembers = Array.from(clients.values()).filter(c => c.fleetName === killerClient.fleetName);
  }

  // --- Asteroids destroyed ---
  if (ent.type === "generic" || ent.type === "gem_asteroid") {
    const isGem = ent.type === "gem_asteroid";
    const rewardBase = isGem ? 500 : 250;

    if (killerClient) {
      if (killerFleetMembers) {
        const share = Math.floor(rewardBase / killerFleetMembers.length);
        for (const member of killerFleetMembers) {
          if (isGem) {
            const added = member.ship.addCargo("luxuries", 1);
            if (added) {
              member.send({
                type: "notification",
                message: `Fleet shattered Rare Gem! Cargo added: 1 unit luxuries (${killerClient.nickname} mined).`,
                style: "success"
              });
            } else {
              member.ship.credits += share;
              member.send({
                type: "notification",
                message: `Fleet shattered Rare Gem! Cargo full, minerals sold for ${share} CR.`,
                style: "info"
              });
            }
          } else {
            member.ship.credits += share;
            member.send({
              type: "notification",
              message: `Fleet shattered Asteroid! Share awarded: +${share} CR (${killerClient.nickname} mined).`,
              style: "success"
            });
          }
          member.sendStats();
        }
      } else {
        if (isGem) {
          const added = killerClient.ship.addCargo("luxuries", 1);
          if (added) {
            killerClient.send({
              type: "notification",
              message: "Rare Gem Asteroid shattered! Yielded 1 unit of high-value luxuries cargo.",
              style: "success"
            });
          } else {
            killerClient.ship.credits += 500;
            killerClient.send({
              type: "notification",
              message: "Rare Gem Asteroid shattered! Cargo full, minerals sold immediately for 500 CR.",
              style: "info"
            });
          }
        } else {
          killerClient.ship.credits += 250;
          killerClient.send({
            type: "notification",
            message: "Asteroid shattered! Recovered 250 CR minerals.",
            style: "success"
          });
        }
        killerClient.sendStats();
      }
    }
  }

  // --- Ships destroyed ---
  else if (ent.type === "ship") {
    const isPirate = ent.name === "Pirate Raider" || ent.name.includes("Pirate") || ent.name.includes("Raider");
    
    // Check bounties for connected clients
    for (const client of clients.values()) {
      const completedBounty = client.missionManager.checkBountyCompletion(ent.name, client.ship);
      if (completedBounty) {
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
      broadcastNotification(`${ent.name} has been destroyed in combat.`, "info");
    }

    scheduleAIRespawn(ent.name, ent.role);
  }

  // --- Respawn dead player ship ---
  else {
    const deadClient = Array.from(clients.values()).find(c => c.ship === ent);
    if (deadClient) {
      handlePlayerRespawnServer(deadClient);
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

// 6. Start listening
server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`    NEBULA SECTOR AUTHORITATIVE MULTIPLAYER SERVER LISTENING    `);
  console.log(`    PORT: ${PORT} | Mode: Authoritative co-op sandboxing        `);
  console.log(`    URL: http://localhost:${PORT}                              `);
  console.log(`================================================================`);
});
