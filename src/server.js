import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import localtunnel from "localtunnel";
import { exec } from "child_process";

import { Vector2D } from "./physics/Vector2D.js";
import { Ship } from "./engine/Ship.js";
import { AIController } from "./engine/ai/AIController.js";
import { MissionManager } from "./engine/MissionManager.js";
import { NEBULAE } from "./engine/Nebulae.js";
import { GameInstance, BASE_MARKETS } from "./engine/GameInstance.js";

// Paths for static file server
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = process.env.PORT || 8080;

// Initialize HTTP Server (static file delivery)
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

// Authoritative World State Instances Directory
const instances = new Map();
const persistentSessions = new Map(); // sessionToken -> clientObj
const clients = new Map(); // ws -> clientObj

// Create Default permanent Public Arena Room
const publicInstance = new GameInstance("public", "Public Arena");
instances.set("public", publicInstance);

// Setup multi-room ticker loops
const TICK_RATE = 30;
const dt = 1 / TICK_RATE;

// 1. Authoritative Room Physics Updates Loop (30Hz)
setInterval(() => {
  const now = Date.now();
  for (const room of instances.values()) {
    if (room.clients.size > 0) {
      room.lastActiveTime = now;
    }

    // A. Drive AI merchant itineraries and update active AIs
    for (const ai of room.ais) {
      if (ai.ship.isDestroyed) continue;
      
      if (ai.role === "merchant" && !ai.destination) {
        const potentialHubs = room.planets.filter((p) => p.position.distance(ai.ship.position) > 250);
        if (potentialHubs.length > 0) {
          const nextHub = potentialHubs[Math.floor(Math.random() * potentialHubs.length)];
          ai.destination = nextHub.position.clone();
        }
      }
      ai.update(dt, room.engine.entities);
    }

    // B. Apply Solar EMP Events Shield Regen nerfing
    const originalRegens = new Map();
    if (room.activeSectorEvent && room.activeSectorEvent.type === "emp") {
      const empPlanet = room.planets.find(p => p.name === room.activeSectorEvent.planetName);
      if (empPlanet) {
        for (const ent of room.engine.entities) {
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

    // C. Apply Tractor Beam Matrix pull forces
    for (const ent of room.engine.entities) {
      if (ent.type === "ship" && !ent.isDestroyed) {
        if (ent.outfits && ent.outfits.includes("Tractor Beam Matrix")) {
          for (const pod of room.engine.entities) {
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

    // D. Cargo collection ingestion
    const podsToRemove = [];
    for (const pod of room.engine.entities) {
      if (pod.type === "cargo_pod") {
        for (const ship of room.engine.entities) {
          if (ship.type === "ship" && !ship.isDestroyed) {
            const dist = ship.position.distance(pod.position);
            if (dist <= ship.radius + pod.radius) {
              const success = ship.addCargo(pod.resourceType, pod.amount);
              if (success) {
                podsToRemove.push(pod);
                const client = Array.from(room.clients.values()).find(c => c.ship === ship);
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
                const client = Array.from(room.clients.values()).find(c => c.ship === ship);
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
      room.engine.removeEntity(pod);
    }

    // E. Apply Nebula Hazards
    for (const ent of room.engine.entities) {
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
          if (room.engine.globalDrag > 0 && ent.velocity.magnitude() > 0) {
            const extraDragCoef = activeNebula.dragMultiplier - 1.0;
            const extraDragForce = ent.velocity.multiply(
              -extraDragCoef * room.engine.globalDrag * ent.mass
            );
            ent.applyForce(extraDragForce);
          }
          if (activeNebula.hazardType === "shield_dampen") {
            const currentRegen = originalRegens.has(ent) ? 0 : ent.shieldRegen;
            if (!originalRegens.has(ent)) {
              originalRegens.set(ent, ent.shieldRegen);
            }
            ent.shieldRegen = currentRegen * 0.5;
          }
        }
      }
    }

    // F. Update local room physical kinematics
    room.engine.update(dt);

    // G. Restore shield regens
    for (const [ship, origRegen] of originalRegens.entries()) {
      ship.shieldRegen = origRegen;
    }

    // H. Replenish Asteroids
    const activeAsteroids = room.engine.entities.filter(e => e.type === "generic" || e.type === "gem_asteroid");
    if (activeAsteroids.length < 35) {
      room.spawnNewAsteroid(false);
    }

    // I. Update active fleets coordinates
    for (const code of room.fleets.keys()) {
      room.broadcastFleetUpdate(code);
    }

    // J. Authoritative World State Broadcast
    const serialized = room.serializeEntities();
    for (const client of room.clients.values()) {
      client.send({
        type: "state",
        entities: serialized,
      });
    }
  }
}, 1000 / TICK_RATE);

// 2. Room Economy Shortage/Surplus events loops (45 seconds)
setInterval(() => {
  for (const room of instances.values()) {
    runEconomyTickForRoom(room);
  }
}, 45000);

// 3. Room Environmental Siege/EMP events loops (90 seconds)
setInterval(() => {
  for (const room of instances.values()) {
    runSectorEventTickForRoom(room);
  }
}, 90000);

// 4. Room Economy Normalization drift loops (6 seconds)
setInterval(() => {
  for (const room of instances.values()) {
    runEconomyNormalizationForRoom(room);
  }
}, 6000);

// 5. Inactive Custom Rooms Garbage Collection (10 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of instances.entries()) {
    if (id === "public") continue;
    if (room.clients.size === 0 && now - room.lastActiveTime > 30000) {
      console.log(`🧹 Garbage Collecting inactive sector: [${room.name}] (${id})`);
      instances.delete(id);
      broadcastLobbySync();
    }
  }
}, 10000);

// Dynamic Event Managers Helpers
function runEconomyTickForRoom(room) {
  if (room.activeEconomicEvent) {
    const prevPlanet = room.planets.find(p => p.name === room.activeEconomicEvent.planetName);
    if (prevPlanet && BASE_MARKETS[room.activeEconomicEvent.planetName]) {
      const origPrice = BASE_MARKETS[room.activeEconomicEvent.planetName][room.activeEconomicEvent.commodity];
      prevPlanet.market[room.activeEconomicEvent.commodity] = origPrice;
      room.broadcast({
        type: "market_sync",
        planetName: prevPlanet.name,
        market: prevPlanet.market
      });
    }
  }

  const planet = room.planets[Math.floor(Math.random() * room.planets.length)];
  if (!planet) return;
  const commodities = Object.keys(BASE_MARKETS[planet.name]);
  const commodity = commodities[Math.floor(Math.random() * commodities.length)];
  const isShortage = Math.random() < 0.5;

  const originalPrice = BASE_MARKETS[planet.name][commodity];
  const multiplier = isShortage ? 1.8 : 0.5;
  const newPrice = Math.round(originalPrice * multiplier);

  planet.market[commodity] = newPrice;
  room.activeEconomicEvent = {
    planetName: planet.name,
    commodity,
    originalPrice
  };

  room.broadcast({
    type: "market_sync",
    planetName: planet.name,
    market: planet.market
  });

  const formattedMsg = isShortage
    ? `MARKET ALERT: ${planet.name} reports severe ${commodity.toUpperCase()} shortage! Prices soared to ${newPrice} CR!`
    : `MARKET ALERT: ${planet.name} reports massive ${commodity.toUpperCase()} surplus! Prices dropped to ${newPrice} CR!`;

  room.broadcastNotification(formattedMsg, isShortage ? "error" : "success");

  const chatPayload = {
    type: "chat",
    channel: "global",
    sender: "SYSTEM-ECONOMY",
    text: formattedMsg
  };
  for (const c of room.clients.values()) {
    c.send(chatPayload);
  }
}

function runSectorEventTickForRoom(room) {
  if (room.activeSectorEvent) {
    if (room.activeSectorEvent.type === "siege") {
      for (const shipId of room.activeSectorEvent.spawnedShipIds) {
        const ent = room.engine.entities.find(e => e.id === shipId);
        if (ent) {
          room.engine.removeEntity(ent);
        }
        const aiIdx = room.ais.findIndex(a => a.ship.id === shipId);
        if (aiIdx !== -1) {
          room.ais.splice(aiIdx, 1);
        }
      }
      
      const formattedMsg = `EVENT OVER: The Pirate Siege at ${room.activeSectorEvent.planetName} has been repelled!`;
      room.broadcastNotification(formattedMsg, "success");
      
      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg
      };
      room.broadcast(chatPayload);
    } else if (room.activeSectorEvent.type === "emp") {
      const formattedMsg = `EVENT OVER: The Solar EMP Ion Storm at ${room.activeSectorEvent.planetName} has subsided.`;
      room.broadcastNotification(formattedMsg, "success");
      
      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg
      };
      room.broadcast(chatPayload);
    }
    room.activeSectorEvent = null;
  }

  const eventTypes = ["siege", "emp"];
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  let targetPlanet;
  if (eventType === "emp") {
    const nonSolPlanets = room.planets.filter(p => p.name !== "Sol");
    targetPlanet = nonSolPlanets[Math.floor(Math.random() * nonSolPlanets.length)];
  } else {
    targetPlanet = room.planets[Math.floor(Math.random() * room.planets.length)];
  }

  if (!targetPlanet) return;

  if (eventType === "siege") {
    const spawnedShipIds = [];
    const count = 2;
    
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
      room.engine.addEntity(raiderShip);
      room.ais.push(controller);
      spawnedShipIds.push(shipId);
    }

    room.activeSectorEvent = {
      type: "siege",
      planetName: targetPlanet.name,
      spawnedShipIds: spawnedShipIds
    };

    const formattedMsg = `RED ALERT: Pirate Siege detected at ${targetPlanet.name}! Heavy raiders are attacking the trade hub!`;
    room.broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg
    };
    room.broadcast(chatPayload);

  } else if (eventType === "emp") {
    room.activeSectorEvent = {
      type: "emp",
      planetName: targetPlanet.name,
      spawnedShipIds: []
    };

    const formattedMsg = `ENVIRONMENT ALERT: Solar EMP Ion Storm detected at ${targetPlanet.name}! Shield regeneration disabled within 400u!`;
    room.broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg
    };
    room.broadcast(chatPayload);
  }

  broadcastEventSyncForRoom(room);
}

function broadcastEventSyncForRoom(room) {
  const eventPayload = {
    type: "event_sync",
    event: room.activeSectorEvent ? {
      type: room.activeSectorEvent.type,
      planetName: room.activeSectorEvent.planetName
    } : null
  };
  room.broadcast(eventPayload);
}

function runEconomyNormalizationForRoom(room) {
  for (const p of room.planets) {
    const base = BASE_MARKETS[p.name];
    if (!base) continue;

    let planetChanged = false;
    for (const item of Object.keys(p.market)) {
      if (room.activeEconomicEvent && room.activeEconomicEvent.planetName === p.name && room.activeEconomicEvent.commodity === item) {
        continue;
      }

      const current = p.market[item];
      const baseline = base[item];
      if (current !== baseline) {
        const diff = baseline - current;
        const step = Math.sign(diff) * Math.max(1, Math.round(Math.abs(diff) * 0.005));
        p.market[item] = current + step;
        planetChanged = true;
      }
    }

    if (planetChanged) {
      room.broadcast({
        type: "market_sync",
        planetName: p.name,
        market: p.market
      });
    }
  }
}

// Global Matchmaking Multi-Instance Lobby helpers
function broadcastLobbySync() {
  const roomsList = [];
  for (const room of instances.values()) {
    roomsList.push({
      id: room.id,
      name: room.name,
      playersCount: room.clients.size
    });
  }

  const payload = {
    type: "lobby_sync",
    rooms: roomsList
  };

  const str = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (!client.roomId) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(str);
      }
    }
  }
}

function sendLobbyList(clientObj) {
  const roomsList = [];
  for (const room of instances.values()) {
    roomsList.push({
      id: room.id,
      name: room.name,
      playersCount: room.clients.size
    });
  }

  clientObj.send({
    type: "lobby_sync",
    rooms: roomsList
  });
}

function joinRoom(clientObj, roomId, nickname) {
  const room = instances.get(roomId) || instances.get("public");
  
  clientObj.roomId = room.id;
  clientObj.nickname = (nickname || "Pilot").trim().substring(0, 12);
  
  room.clients.set(clientObj.ws, clientObj);
  room.lastActiveTime = Date.now();

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
  room.engine.addEntity(ship);

  // Set up global session token
  const sessionToken = clientObj.id;
  persistentSessions.set(sessionToken, clientObj);

  clientObj.send({
    type: "init",
    playerId: clientObj.id,
    nickname: clientObj.nickname,
    sessionToken: sessionToken,
    roomId: room.id,
    roomName: room.name
  });

  clientObj.send({
    type: "notification",
    message: `Welcome aboard Commander ${clientObj.nickname}! Sector ${room.name.toUpperCase()} systems nominal.`,
    style: "success"
  });

  room.broadcastNotification(`${clientObj.nickname} entered sector!`, "info");
  clientObj.sendStats();

  const bulkMarkets = {};
  for (const p of room.planets) {
    bulkMarkets[p.name] = p.market;
  }
  clientObj.send({
    type: "market_bulk_sync",
    markets: bulkMarkets
  });

  clientObj.send({
    type: "event_sync",
    event: room.activeSectorEvent ? {
      type: room.activeSectorEvent.type,
      planetName: room.activeSectorEvent.planetName
    } : null
  });

  room.broadcastRosterUpdate();
}

// 6. WebSockets Server Core Implementation
const wss = new WebSocketServer({ server });

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
    roomId: null,
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

  clientObj.missionManager.onStorylineStageAdvanced = (mission) => {
    const room = instances.get(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
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
    room.engine.addEntity(bossShip);
    room.ais.push(controller);

    clientObj.send({
      type: "notification",
      message: `STORY ALERT: ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
      style: "error"
    });
  };

  clientObj.missionManager.onBountyAccepted = (mission) => {
    const room = instances.get(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
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
    room.engine.addEntity(bossShip);
    room.ais.push(controller);

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

    const room = clientObj.roomId ? instances.get(clientObj.roomId) : null;

    if (msg.type === "join") {
      const token = msg.sessionToken;

      if (token && persistentSessions.has(token)) {
        const sessionClient = persistentSessions.get(token);
        
        if (sessionClient.cleanupTimeout) {
          clearTimeout(sessionClient.cleanupTimeout);
          sessionClient.cleanupTimeout = null;
        }

        sessionClient.ws = ws;
        clients.delete(ws);
        clients.set(ws, sessionClient);

        const currentRoom = instances.get(sessionClient.roomId) || instances.get("public");
        sessionClient.roomId = currentRoom.id;
        currentRoom.clients.set(ws, sessionClient);

        if (sessionClient.ship) {
          const existing = currentRoom.engine.entities.find(e => e.id === sessionClient.id);
          if (!existing) {
            currentRoom.engine.addEntity(sessionClient.ship);
          }
        }

        sessionClient.send({
          type: "init",
          playerId: sessionClient.id,
          nickname: sessionClient.nickname,
          sessionToken: token,
          roomId: currentRoom.id,
          roomName: currentRoom.name
        });

        sessionClient.send({
          type: "notification",
          message: `Neural link re-established! Welcome back, Commander ${sessionClient.nickname}.`,
          style: "success"
        });

        currentRoom.broadcastNotification(`Commander ${sessionClient.nickname} has re-established neural link!`, "success");
        sessionClient.sendStats();

        const bulkMarkets = {};
        for (const p of currentRoom.planets) {
          bulkMarkets[p.name] = p.market;
        }
        sessionClient.send({
          type: "market_bulk_sync",
          markets: bulkMarkets
        });

        sessionClient.send({
          type: "event_sync",
          event: currentRoom.activeSectorEvent ? {
            type: currentRoom.activeSectorEvent.type,
            planetName: currentRoom.activeSectorEvent.planetName
          } : null
        });

        currentRoom.broadcastRosterUpdate();
        if (sessionClient.fleetName) {
          currentRoom.broadcastFleetUpdate(sessionClient.fleetName);
        }
      } else {
        sendLobbyList(clientObj);
      }
    }

    else if (msg.type === "create_room") {
      const name = (msg.name || "").trim().substring(0, 20);
      if (!name) {
        clientObj.send({ type: "notification", message: "Invalid Sector Name!", style: "error" });
        return;
      }
      const newRoomId = "room-" + Math.random().toString(36).substring(2, 9);
      const newRoomInstance = new GameInstance(newRoomId, name);
      instances.set(newRoomId, newRoomInstance);
      console.log(`🌌 Created custom sector: [${name}] (${newRoomId})`);

      joinRoom(clientObj, newRoomId, msg.nickname);
      broadcastLobbySync();
    }

    else if (msg.type === "join_room") {
      joinRoom(clientObj, msg.roomId || "public", msg.nickname);
      broadcastLobbySync();
    }

    else if (msg.type === "controls") {
      if (clientObj.ship && !clientObj.isLanded && !clientObj.ship.isDestroyed) {
        clientObj.ship.setControls(msg.controls);
        clientObj.ship.heading = msg.heading;
      }
    }

    else if (msg.type === "land") {
      if (clientObj.ship && !clientObj.isLanded && !clientObj.ship.isDestroyed && room) {
        const targetPlanet = room.planets.find((p) => p.canLand(clientObj.ship));
        if (targetPlanet) {
          const completed = clientObj.missionManager.checkArrivalCompletions(targetPlanet.name, clientObj.ship);
          for (const m of completed) {
            if (clientObj.fleetName) {
              const fleetSet = room.fleets.get(clientObj.fleetName);
              if (fleetSet && fleetSet.size > 1) {
                const share = Math.floor(m.reward / fleetSet.size);
                clientObj.ship.credits -= m.reward;
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

            clientObj.send({
              type: "notification",
              message: `Contract Completed: ${m.title}! Received +${m.reward.toLocaleString()} CR`,
              style: "success"
            });
          }

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
          clientObj.ship.hyperFuel = clientObj.ship.maxHyperFuel;
          room.engine.removeEntity(clientObj.id);

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
          room.broadcastRosterUpdate();
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
      if (clientObj.ship && clientObj.isLanded && room) {
        const p = clientObj.planetLandedOn;
        clientObj.isLanded = false;
        clientObj.planetLandedOn = null;

        clientObj.ship.position = p.position.add(new Vector2D(0, p.landingRadius + 40));
        clientObj.ship.velocity = new Vector2D(0, 0);
        clientObj.ship.clearControls();
        room.engine.addEntity(clientObj.ship);

        clientObj.send({ type: "launched" });
        clientObj.send({
          type: "notification",
          message: "Launch sequence completed! Thrusters online.",
          style: "success"
        });
        clientObj.sendStats();
        room.broadcastRosterUpdate();
      }
    }

    else if (msg.type === "trade") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn && room) {
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
            const basePrice = (BASE_MARKETS[p.name] && BASE_MARKETS[p.name][msg.item]) || 150;
            const currentPrice = p.market[msg.item];
            p.market[msg.item] = Math.min(Math.round(basePrice * 2.5), Math.round(currentPrice * 1.022));

            clientObj.send({
              type: "notification",
              message: `Purchased 1 ton of ${msg.item} for ${price} CR`,
              style: "success"
            });
            clientObj.sendStats();
            room.broadcast({
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
            const basePrice = (BASE_MARKETS[p.name] && BASE_MARKETS[p.name][msg.item]) || 150;
            const currentPrice = p.market[msg.item];
            p.market[msg.item] = Math.max(Math.round(basePrice * 0.4), Math.round(currentPrice * 0.982));

            clientObj.send({
              type: "notification",
              message: `Sold 1 ton of ${msg.item} for ${price} CR`,
              style: "success"
            });
            clientObj.sendStats();
            room.broadcast({
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

        clientObj.ship.maxShield = s.maxShield;
        clientObj.ship.shield = s.maxShield;
        clientObj.ship.maxArmor = s.maxArmor;
        clientObj.ship.armor = s.maxArmor;
        clientObj.ship.cargoCapacity = s.cargoCapacity;
        clientObj.ship.thrustPower = s.thrustPower;
        clientObj.ship.turnRate = s.turnRate;

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
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn && room) {
        if (!clientObj.missionManager.availableMissions[msg.planetName]) {
          clientObj.missionManager.generateMissionsForPlanet(msg.planetName, room.planets);
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

      if (room) {
        room.leaveCurrentFleet(clientObj);
        clientObj.fleetName = code;
        if (!room.fleets.has(code)) {
          room.fleets.set(code, new Set());
        }
        room.fleets.get(code).add(clientObj);

        clientObj.send({
          type: "notification",
          message: `Joined fleet: ${code}`,
          style: "success"
        });

        room.broadcastFleetUpdate(code);
        room.broadcastRosterUpdate();
      }
    }

    else if (msg.type === "fleet_leave") {
      if (clientObj.fleetName && room) {
        const oldCode = clientObj.fleetName;
        room.leaveCurrentFleet(clientObj);
        clientObj.send({
          type: "notification",
          message: `Left fleet: ${oldCode}`,
          style: "info"
        });
        room.broadcastRosterUpdate();
      }
    }

    else if (msg.type === "chat") {
      const channel = msg.channel || "global";
      const text = (msg.text || "").trim().substring(0, 100);
      if (!text) return;

      if (channel === "fleet" && room) {
        if (!clientObj.fleetName) {
          clientObj.send({
            type: "notification",
            message: "You are not in a fleet! Join a fleet to use Fleet comms.",
            style: "error"
          });
          return;
        }

        const fleetSet = room.fleets.get(clientObj.fleetName);
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
      } else if (room) {
        const chatPayload = {
          type: "chat",
          channel: "global",
          sender: clientObj.nickname,
          text: text
        };
        for (const c of room.clients.values()) {
          c.send(chatPayload);
        }
      }
    }

    else if (msg.type === "warp_jump") {
      if (room) {
        const gate = room.engine.getEntity(msg.gateId);
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

        clientObj.ship.hyperFuel = Math.max(0, clientObj.ship.hyperFuel - 20);
        clientObj.ship.position = gate.targetPosition.clone();
        clientObj.ship.velocity.set(0, 0);

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

        let escortCount = 0;
        for (const ai of room.ais) {
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
        room.broadcastRosterUpdate();
      }
    }

    else if (msg.type === "boarding_action") {
      if (room) {
        const target = room.engine.getEntity(msg.targetId);
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
            clientObj.send({ type: "notification", message: "No new modules found. Salvaged scrap for +800 CR.", style: "info" });
            clientObj.sendStats();
          }
        }

        else if (msg.action === "capture") {
          const fee = 1500;
          if (clientObj.ship.credits < fee) {
            clientObj.send({ type: "notification", message: "Insufficient credits for crew (1,500 CR)!", style: "error" });
            return;
          }
          clientObj.ship.credits -= fee;

          target.isDisabled = false;
          target.armor = Math.floor(target.maxArmor * 0.4);
          target.shield = 0;
          target.name = `${clientObj.nickname}'s Escort`;

          const controller = new AIController(target, "escort");
          controller.flagship = clientObj.ship;
          room.ais.push(controller);

          clientObj.send({ type: "notification", message: `Neural Command Link Established! Escort active.`, style: "success" });
          clientObj.sendStats();
        }

        else if (msg.action === "scuttle") {
          const scrapReward = Math.floor(target.maxArmor * 4 + Math.random() * 200);
          clientObj.ship.credits += scrapReward;
          room.engine.removeEntity(target.id);

          clientObj.send({ type: "notification", message: `Hull scuttled. Salvaged scrap for +${scrapReward} CR`, style: "success" });
          clientObj.sendStats();
        }

        room.broadcastRosterUpdate();
      }
    }

    else if (msg.type === "escort_command") {
      if (room) {
        const cmd = msg.command;
        let count = 0;
        for (const ai of room.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            ai.escortMode = cmd;
            count++;
          }
        }
        clientObj.send({ type: "notification", message: `Transmitted [${cmd.toUpperCase()}] commands to ${count} AI wingmen.`, style: "success" });
      }
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
    
    activeClient.cleanupTimeout = setTimeout(() => {
      const currentRoom = instances.get(activeClient.roomId);
      if (currentRoom) {
        currentRoom.leaveCurrentFleet(activeClient);
        if (activeClient.ship) {
          currentRoom.engine.removeEntity(activeClient.id);
        }
        currentRoom.clients.delete(ws);
      }
      clients.delete(ws);
      persistentSessions.delete(activeClient.id);
      if (currentRoom) {
        currentRoom.broadcastNotification(`${activeClient.nickname} has left the sector (neural link lost).`, "info");
        currentRoom.broadcastRosterUpdate();
      }
      broadcastLobbySync();
    }, 30000);

    clients.delete(ws);
    const currentRoom = instances.get(activeClient.roomId);
    if (currentRoom) {
      currentRoom.broadcastNotification(`${activeClient.nickname} neural link disconnected. Standby recovery active...`, "warning");
      currentRoom.broadcastRosterUpdate();
    }
  });
});

// Start listening
server.listen(PORT, async () => {
  console.log(`================================================================`);
  console.log(`    NEBULA SECTOR AUTHORITATIVE MULTIPLAYER SERVER LISTENING    `);
  console.log(`    PORT: ${PORT} | Mode: Authoritative multi-instance rooms    `);
  console.log(`    URL: http://localhost:${PORT}                              `);
  console.log(`================================================================`);

  // Programmatic localtunnel startup
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    try {
      console.log(`📡 Spinning up programmatic localtunnel...`);
      const tunnel = await localtunnel({ port: PORT });
      console.log(`🚀 Public Multiplayer URL: ${tunnel.url}`);
      
      exec(`echo ${tunnel.url} | clip`, (err) => {
        if (!err) {
          console.log("📋 Public URL successfully copied to clipboard! Share it (Ctrl+V) with friends.");
        } else {
          console.log("Could not copy URL to clipboard automatically.");
        }
      });
      
      tunnel.on('close', () => {
        console.log("Localtunnel connection closed.");
      });
    } catch (e) {
      console.log("Could not establish localtunnel: ", e.message);
    }
  }
});
