import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { exec } from "child_process";

import { Vector2D } from "./physics/Vector2D.js";
import { Ship } from "./engine/Ship.js";
import { AIController } from "./engine/ai/AIController.js";
import { MissionManager } from "./engine/MissionManager.js";
import { NEBULAE } from "./engine/Nebulae.js";
import { GameInstance } from "./engine/GameInstance.js";
import { nextFrame } from "./net/BroadcastFramer.js";
import { JsonFileStore } from "./persistence/Store.js";
import { PersistenceManager } from "./persistence/PersistenceManager.js";
import { applyGalaxy, applyPlayer } from "./persistence/serializers.js";
import { applyRepair, applyRefuel } from "./engine/PortServices.js";
import {
  canJump,
  consumeJump,
  DEFAULT_HYPERDRIVE_OPTIONS,
} from "./engine/Hyperdrive.js";

import { plunder, boardRepair } from "./engine/Boarding.js";
import { isAllowedOrigin } from "./net/originPolicy.js";

const JUMP_FUEL_COST = DEFAULT_HYPERDRIVE_OPTIONS.jumpCost;

// ws inbound hardening (spec 002): cap inbound frame size to blunt memory-DoS,
// and accept only same-origin upgrades + an optional ALLOWED_ORIGINS allowlist
// (defends against Cross-Site WebSocket Hijacking).
const WS_MAX_PAYLOAD = 256 * 1024; // 256 KB — far above any legit client message
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Process-level uncaught error and promise rejection logging
process.on("uncaughtException", (err) => {
  console.error("🚨 CRITICAL UNCAUGHT EXCEPTION:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "🚨 CRITICAL UNHANDLED REJECTION at:",
    promise,
    "reason:",
    reason,
  );
});

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

// Persistence layer (P1): swappable Store + serializers behind a manager that
// silently absorbs disk failures. Tests against an InMemoryStore live in
// `src/persistence/PersistenceManager.test.js`; here we wire the real file
// store so the public sector survives restarts.
const persistenceDir = process.env.PERSISTENCE_DIR || "./data";
const persistenceManager = new PersistenceManager({
  store: new JsonFileStore({ dir: persistenceDir }),
});

// Create Default permanent Public Arena Room
const publicInstance = new GameInstance("public", "Public Arena");
instances.set("public", publicInstance);

// Restore any saved galaxy state for the public room. Fire-and-forget so the
// HTTP server can start listening immediately; the heartbeat runs no sooner
// than 8 seconds from boot which is well after this resolves. Errors are
// already swallowed inside `loadGalaxy` so a corrupt save can't crash boot.
persistenceManager.loadGalaxy(publicInstance.id).then((snapshot) => {
  if (snapshot) {
    applyGalaxy(publicInstance, snapshot);
    console.log(
      `💾 Restored galaxy state for [${publicInstance.name}] from ${persistenceDir}`,
    );
  }
});

// Periodic galaxy autosave (P1): persist every live room on a slow cadence so
// a kill -9 only ever loses up to ~30 seconds of heartbeat aging.
const AUTOSAVE_INTERVAL_MS = Number(process.env.AUTOSAVE_INTERVAL_MS) || 30000;
persistenceManager.startAutosave(
  () => instances.values(),
  AUTOSAVE_INTERVAL_MS,
);

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
        const potentialHubs = room.planets.filter(
          (p) => p.position.distance(ai.ship.position) > 250,
        );
        if (potentialHubs.length > 0) {
          const nextHub =
            potentialHubs[Math.floor(Math.random() * potentialHubs.length)];
          ai.destination = nextHub.position.clone();
        }
      }
      ai.update(dt, room.engine.entities);
    }

    // B. Apply Solar EMP Events Shield Regen nerfing
    const originalRegens = new Map();
    if (room.activeSectorEvent && room.activeSectorEvent.type === "emp") {
      const empPlanet = room.planets.find(
        (p) => p.name === room.activeSectorEvent.planetName,
      );
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
                const pullForce = toShip
                  .normalize()
                  .multiply(forceMag * pod.mass);
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
                const client = Array.from(room.clients.values()).find(
                  (c) => c.ship === ship,
                );
                if (client) {
                  client.send({
                    type: "notification",
                    message: `+${pod.amount} ${pod.resourceType.toUpperCase()} collected!`,
                    style: "success",
                  });
                  client.send({
                    type: "cargo_pickup",
                    resourceType: pod.resourceType,
                    amount: pod.amount,
                    x: pod.position.x,
                    y: pod.position.y,
                  });
                  client.sendStats();
                }
                break;
              } else {
                const client = Array.from(room.clients.values()).find(
                  (c) => c.ship === ship,
                );
                if (
                  client &&
                  (!ship.lastCargoFullAlert ||
                    Date.now() - ship.lastCargoFullAlert > 2000)
                ) {
                  ship.lastCargoFullAlert = Date.now();
                  client.send({
                    type: "notification",
                    message:
                      "Cargo bay is FULL! Upgrade cargo holds or sell commodities.",
                    style: "error",
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
              -extraDragCoef * room.engine.globalDrag * ent.mass,
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
    const activeAsteroids = room.engine.entities.filter(
      (e) => e.type === "generic" || e.type === "gem_asteroid",
    );
    if (activeAsteroids.length < 35) {
      room.spawnNewAsteroid(false);
    }

    // I. Update active fleets coordinates
    for (const code of room.fleets.keys()) {
      room.broadcastFleetUpdate(code);
    }

    // J. Authoritative World State Broadcast (P7: snapshots + deltas).
    // Frame this tick as either a full keyframe (`state_snapshot`) or a delta
    // against the previous broadcast (`state_delta`). The wire string is built
    // ONCE per tick and reused for every client so cost stays O(clients) on the
    // socket layer alone, not O(clients * entities) on JSON.stringify.
    const frame = nextFrame({
      entities: room.serializeEntities(),
      prev: room.broadcastState,
      forceKeyframe: !!room.needsKeyframe,
    });
    room.broadcastState = frame.nextState;
    room.needsKeyframe = false;
    const statePayload = JSON.stringify(frame.payload);
    for (const client of room.clients.values()) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(statePayload);
      }
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

// 4b. Galaxy Heartbeat: age the economy and diffuse prices across trade lanes
// even when nobody is in the sector (8 seconds).
setInterval(() => {
  for (const room of instances.values()) {
    const changedNames = room.galaxyHeartbeat.pulse();
    for (const name of changedNames) {
      const planet = room.planets.find((p) => p.name === name);
      if (planet) {
        room.broadcast({
          type: "market_sync",
          planetName: planet.name,
          market: planet.market,
        });
      }
    }
  }
}, 8000);

// 5. Inactive Custom Rooms Garbage Collection (10 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of instances.entries()) {
    if (id === "public") continue;
    if (room.clients.size === 0 && now - room.lastActiveTime > 30000) {
      console.log(
        `🧹 Garbage Collecting inactive sector: [${room.name}] (${id})`,
      );
      room.destroy();
      instances.delete(id);
      broadcastLobbySync();
    }
  }
}, 10000);

// 6. Periodic Lobby Sync Refresh for clients still on the lobby screen (5 seconds)
setInterval(() => {
  broadcastLobbySync();
}, 5000);

// Dynamic Event Managers Helpers
function runEconomyTickForRoom(room) {
  if (room.economyManager.activeEconomicEvent) {
    const prevPlanetName = room.economyManager.activeEconomicEvent.planetName;
    const prevPlanet = room.planets.find((p) => p.name === prevPlanetName);
    room.economyManager.clearActiveEvent();
    if (prevPlanet) {
      room.broadcast({
        type: "market_sync",
        planetName: prevPlanet.name,
        market: prevPlanet.market,
      });
    }
  }

  const event = room.economyManager.triggerRandomEvent();
  if (!event) return;

  room.broadcast({
    type: "market_sync",
    planetName: event.planetName,
    market: room.planets.find((p) => p.name === event.planetName).market,
  });

  const formattedMsg = event.isShortage
    ? `MARKET ALERT: ${event.planetName} reports severe ${event.commodity.toUpperCase()} shortage! Prices soared to ${event.newPrice} CR!`
    : `MARKET ALERT: ${event.planetName} reports massive ${event.commodity.toUpperCase()} surplus! Prices dropped to ${event.newPrice} CR!`;

  room.broadcastNotification(
    formattedMsg,
    event.isShortage ? "error" : "success",
  );

  const chatPayload = {
    type: "chat",
    channel: "global",
    sender: "SYSTEM-ECONOMY",
    text: formattedMsg,
  };
  for (const c of room.clients.values()) {
    c.send(chatPayload);
  }
}

function runSectorEventTickForRoom(room) {
  if (room.activeSectorEvent) {
    if (room.activeSectorEvent.type === "siege") {
      for (const shipId of room.activeSectorEvent.spawnedShipIds) {
        const ent = room.engine.entities.find((e) => e.id === shipId);
        if (ent) {
          room.engine.removeEntity(ent);
        }
        const aiIdx = room.ais.findIndex((a) => a.ship.id === shipId);
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
        text: formattedMsg,
      };
      room.broadcast(chatPayload);
    } else if (room.activeSectorEvent.type === "emp") {
      const formattedMsg = `EVENT OVER: The Solar EMP Ion Storm at ${room.activeSectorEvent.planetName} has subsided.`;
      room.broadcastNotification(formattedMsg, "success");

      const chatPayload = {
        type: "chat",
        channel: "global",
        sender: "SYSTEM-ALERTS",
        text: formattedMsg,
      };
      room.broadcast(chatPayload);
    }
    room.activeSectorEvent = null;
  }

  const eventTypes = ["siege", "emp"];
  const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

  let targetPlanet;
  if (eventType === "emp") {
    const nonSolPlanets = room.planets.filter((p) => p.name !== "Sol");
    targetPlanet =
      nonSolPlanets[Math.floor(Math.random() * nonSolPlanets.length)];
  } else {
    targetPlanet =
      room.planets[Math.floor(Math.random() * room.planets.length)];
  }

  if (!targetPlanet) return;

  if (eventType === "siege") {
    const spawnedShipIds = [];
    const count = 2;

    for (let i = 0; i < count; i++) {
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnDist = targetPlanet.landingRadius + 180 + Math.random() * 50;
      const spawnPos = targetPlanet.position.add(
        new Vector2D(
          Math.cos(spawnAngle) * spawnDist,
          Math.sin(spawnAngle) * spawnDist,
        ),
      );
      const shipId =
        "siege-raider-" + Math.random().toString(36).substring(2, 9);

      const raiderShip = new Ship({
        id: shipId,
        name: "Siege Raider",
        position: spawnPos,
        velocity: new Vector2D(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30,
        ),
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
      spawnedShipIds: spawnedShipIds,
    };

    const formattedMsg = `RED ALERT: Pirate Siege detected at ${targetPlanet.name}! Heavy raiders are attacking the trade hub!`;
    room.broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg,
    };
    room.broadcast(chatPayload);
  } else if (eventType === "emp") {
    room.activeSectorEvent = {
      type: "emp",
      planetName: targetPlanet.name,
      spawnedShipIds: [],
    };

    const formattedMsg = `ENVIRONMENT ALERT: Solar EMP Ion Storm detected at ${targetPlanet.name}! Shield regeneration disabled within 400u!`;
    room.broadcastNotification(formattedMsg, "error");

    const chatPayload = {
      type: "chat",
      channel: "global",
      sender: "SYSTEM-ALERTS",
      text: formattedMsg,
    };
    room.broadcast(chatPayload);
  }

  broadcastEventSyncForRoom(room);
}

function broadcastEventSyncForRoom(room) {
  const eventPayload = {
    type: "event_sync",
    event: room.activeSectorEvent
      ? {
          type: room.activeSectorEvent.type,
          planetName: room.activeSectorEvent.planetName,
        }
      : null,
  };
  room.broadcast(eventPayload);
}

function runEconomyNormalizationForRoom(room) {
  const changedPlanets = room.economyManager.normalizePrices();
  for (const p of changedPlanets) {
    room.broadcast({
      type: "market_sync",
      planetName: p.name,
      market: p.market,
    });
  }
}

// Global Matchmaking Multi-Instance Lobby helpers
function broadcastLobbySync() {
  const roomsList = [];
  for (const room of instances.values()) {
    roomsList.push({
      id: room.id,
      name: room.name,
      playersCount: room.clients.size,
    });
  }

  const payload = {
    type: "lobby_sync",
    rooms: roomsList,
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
      playersCount: room.clients.size,
    });
  }

  clientObj.send({
    type: "lobby_sync",
    rooms: roomsList,
  });
}

function joinRoom(clientObj, roomId, nickname) {
  // 1. Clean up from previous room if switching
  if (clientObj.roomId) {
    const prevRoom = instances.get(clientObj.roomId);
    if (prevRoom && prevRoom.id !== roomId) {
      console.log(
        `🧼 Cleaning up client [${clientObj.nickname}] (${clientObj.id}) from previous sector: [${prevRoom.name}]`,
      );

      // Leave fleet
      prevRoom.leaveCurrentFleet(clientObj);

      // Clean up escorts
      if (clientObj.ship) {
        const escortsToRemove = [];
        for (const ai of prevRoom.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            escortsToRemove.push(ai);
          }
        }
        for (const ai of escortsToRemove) {
          prevRoom.engine.removeEntity(ai.ship.id);
          const idx = prevRoom.ais.indexOf(ai);
          if (idx !== -1) {
            prevRoom.ais.splice(idx, 1);
          }
        }

        // Remove ship from previous room engine
        prevRoom.engine.removeEntity(clientObj.ship.id);
      }

      // Remove client mapping
      prevRoom.clients.delete(clientObj.ws);

      prevRoom.broadcastNotification(
        `${clientObj.nickname} has left the sector.`,
        "info",
      );
      prevRoom.broadcastRosterUpdate();
    }
  }

  const room = instances.get(roomId) || instances.get("public");

  clientObj.roomId = room.id;
  clientObj.nickname = (nickname || "Pilot").trim().substring(0, 12);

  room.clients.set(clientObj.ws, clientObj);
  room.lastActiveTime = Date.now();
  // Force the next broadcast to be a keyframe so the newcomer starts from a
  // full snapshot instead of waiting up to ~1s for the next scheduled one.
  room.needsKeyframe = true;

  const spawnPos = new Vector2D(
    (Math.random() - 0.5) * 150,
    -150 + (Math.random() - 0.5) * 50,
  );
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
    thrustPower: 90000,
    brakePower: 50000,
    maxSpeed: 1800,
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
    roomName: room.name,
  });

  clientObj.send({
    type: "notification",
    message: `Welcome aboard Commander ${clientObj.nickname}! Sector ${room.name.toUpperCase()} systems nominal.`,
    style: "success",
  });

  room.broadcastNotification(`${clientObj.nickname} entered sector!`, "info");
  clientObj.sendStats();

  const bulkMarkets = {};
  for (const p of room.planets) {
    bulkMarkets[p.name] = p.market;
  }
  clientObj.send({
    type: "market_bulk_sync",
    markets: bulkMarkets,
  });

  clientObj.send({
    type: "event_sync",
    event: room.activeSectorEvent
      ? {
          type: room.activeSectorEvent.type,
          planetName: room.activeSectorEvent.planetName,
        }
      : null,
  });

  room.broadcastRosterUpdate();
}

// 6. WebSockets Server Core Implementation
const wss = new WebSocketServer({
  server,
  maxPayload: WS_MAX_PAYLOAD,
  verifyClient: (info) => {
    const allowed = isAllowedOrigin(info.origin, {
      host: info.req && info.req.headers ? info.req.headers.host : "",
      allow: ALLOWED_ORIGINS,
    });
    if (!allowed) {
      console.warn(
        `[ws] rejected upgrade from disallowed origin: ${info.origin}`,
      );
    }
    return allowed;
  },
});

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
        kills: this.ship.kills,
        combatRating: this.ship.combatRating,
      });
    },
  };

  clientObj.missionManager.onStorylineStageAdvanced = (mission) => {
    const room = instances.get(clientObj.roomId);
    if (!room) return;
    const destPlanet = room.planets.find((p) => p.name === mission.destination);
    if (!destPlanet) return;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnDist = destPlanet.landingRadius + 220;
    const spawnPos = destPlanet.position.add(
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
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
      style: "error",
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
      new Vector2D(
        Math.cos(spawnAngle) * spawnDist,
        Math.sin(spawnAngle) * spawnDist,
      ),
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
      style: "error",
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

      if (token && !persistentSessions.has(token)) {
        // First-touch after a server restart: the in-memory session map is
        // empty even though the client carries a valid token from before.
        // Try to revive them from disk; if no save exists, fall through to
        // the lobby flow below.
        persistenceManager
          .loadPlayer(token)
          .then((wrapped) => {
            if (!wrapped || !wrapped.player) {
              sendLobbyList(clientObj);
              return;
            }
            // Use the saved id so the engine entity (and future saves) keep
            // the same stable identity. `applyPlayer` will also reapply this
            // but joinRoom builds the ship from `clientObj.id` first.
            if (typeof wrapped.player.id === "string" && wrapped.player.id) {
              clientObj.id = wrapped.player.id;
            }
            const targetRoomId =
              wrapped.roomId && instances.has(wrapped.roomId)
                ? wrapped.roomId
                : "public";
            joinRoom(
              clientObj,
              targetRoomId,
              wrapped.player.nickname || clientObj.nickname,
            );
            applyPlayer(clientObj, wrapped.player);
            clientObj.send({
              type: "notification",
              message: `Welcome back, Commander ${clientObj.nickname}. State restored from last session.`,
              style: "success",
            });
            clientObj.sendStats();
          })
          .catch(() => {
            // The manager already logged; just route the client to the lobby.
            sendLobbyList(clientObj);
          });
        return;
      }

      if (token && persistentSessions.has(token)) {
        const sessionClient = persistentSessions.get(token);

        if (sessionClient.cleanupTimeout) {
          clearTimeout(sessionClient.cleanupTimeout);
          sessionClient.cleanupTimeout = null;
        }

        sessionClient.ws = ws;
        clients.delete(ws);
        clients.set(ws, sessionClient);

        const currentRoom =
          instances.get(sessionClient.roomId) || instances.get("public");
        sessionClient.roomId = currentRoom.id;

        // Clean up any stale WebSocket mapping for this client in the room to prevent double broadcasts
        for (const [oldWs, cl] of currentRoom.clients.entries()) {
          if (cl === sessionClient && oldWs !== ws) {
            currentRoom.clients.delete(oldWs);
          }
        }
        currentRoom.clients.set(ws, sessionClient);
        // Reconnecting client needs a full keyframe — their local snapshot/seq
        // has gone stale across the disconnect.
        currentRoom.needsKeyframe = true;

        if (sessionClient.ship) {
          const existing = currentRoom.engine.entities.find(
            (e) => e.id === sessionClient.id,
          );
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
          roomName: currentRoom.name,
        });

        sessionClient.send({
          type: "notification",
          message: `Neural link re-established! Welcome back, Commander ${sessionClient.nickname}.`,
          style: "success",
        });

        currentRoom.broadcastNotification(
          `Commander ${sessionClient.nickname} has re-established neural link!`,
          "success",
        );
        sessionClient.sendStats();

        const bulkMarkets = {};
        for (const p of currentRoom.planets) {
          bulkMarkets[p.name] = p.market;
        }
        sessionClient.send({
          type: "market_bulk_sync",
          markets: bulkMarkets,
        });

        sessionClient.send({
          type: "event_sync",
          event: currentRoom.activeSectorEvent
            ? {
                type: currentRoom.activeSectorEvent.type,
                planetName: currentRoom.activeSectorEvent.planetName,
              }
            : null,
        });

        currentRoom.broadcastRosterUpdate();
        if (sessionClient.fleetName) {
          currentRoom.broadcastFleetUpdate(sessionClient.fleetName);
        }
      } else {
        sendLobbyList(clientObj);
      }
    } else if (msg.type === "create_room") {
      const name = (msg.name || "").trim().substring(0, 20);
      if (!name) {
        clientObj.send({
          type: "notification",
          message: "Invalid Sector Name!",
          style: "error",
        });
        return;
      }
      const newRoomId = "room-" + Math.random().toString(36).substring(2, 9);
      const newRoomInstance = new GameInstance(newRoomId, name);
      instances.set(newRoomId, newRoomInstance);
      console.log(`🌌 Created custom sector: [${name}] (${newRoomId})`);

      joinRoom(clientObj, newRoomId, msg.nickname);
      broadcastLobbySync();
    } else if (msg.type === "join_room") {
      joinRoom(clientObj, msg.roomId || "public", msg.nickname);
      broadcastLobbySync();
    } else if (msg.type === "controls") {
      if (
        clientObj.ship &&
        !clientObj.isLanded &&
        !clientObj.ship.isDestroyed
      ) {
        clientObj.ship.setControls(msg.controls);
        clientObj.ship.heading = msg.heading;
      }
    } else if (msg.type === "land") {
      if (
        clientObj.ship &&
        !clientObj.isLanded &&
        !clientObj.ship.isDestroyed &&
        room
      ) {
        const targetPlanet = room.planets.find((p) =>
          p.canLand(clientObj.ship),
        );
        if (targetPlanet) {
          const completed = clientObj.missionManager.checkArrivalCompletions(
            targetPlanet.name,
            clientObj.ship,
          );
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
                      style: "success",
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
              style: "success",
            });
          }

          if (
            targetPlanet.name !== "Rogue's Hollow" &&
            clientObj.ship.cargo.contraband > 0
          ) {
            clientObj.ship.cargo.contraband = 0;
            clientObj.ship.credits = Math.max(0, clientObj.ship.credits - 1500);
            clientObj.send({
              type: "notification",
              message:
                "Security Scan: Contraband detected! Confiscated and fined 1,500 CR.",
              style: "error",
            });
          }

          clientObj.isLanded = true;
          clientObj.planetLandedOn = targetPlanet;
          clientObj.ship.velocity = new Vector2D(0, 0);
          clientObj.ship.clearControls();
          clientObj.ship.hyperFuel = clientObj.ship.maxHyperFuel;
          room.engine.removeEntity(clientObj.id);

          // Generate available missions authoritatively on the server
          if (!clientObj.missionManager.availableMissions[targetPlanet.name]) {
            clientObj.missionManager.generateMissionsForPlanet(
              targetPlanet.name,
              room.planets,
            );
          }
          const available =
            clientObj.missionManager.availableMissions[targetPlanet.name];

          clientObj.send({
            type: "landed",
            planetName: targetPlanet.name,
            availableMissions: available,
          });
          clientObj.send({
            type: "notification",
            message: `Landed safely on ${targetPlanet.name}. Ship systems secured.`,
            style: "success",
          });
          clientObj.sendStats();
          room.broadcastRosterUpdate();

          // Docking is a natural save-point: state is stable and trades have
          // just happened. Fire-and-forget; errors are swallowed by the manager.
          persistenceManager.savePlayer(clientObj.id, clientObj, room.id);
        } else {
          clientObj.send({
            type: "notification",
            message:
              "Cannot land here. Travel within trigger radius at low speed (< 80 u/s).",
            style: "error",
          });
        }
      }
    } else if (msg.type === "launch") {
      if (clientObj.ship && clientObj.isLanded && room) {
        const p = clientObj.planetLandedOn;
        clientObj.isLanded = false;
        clientObj.planetLandedOn = null;

        clientObj.ship.position = p.position.add(
          new Vector2D(0, p.landingRadius + 40),
        );
        clientObj.ship.velocity = new Vector2D(0, 0);
        clientObj.ship.clearControls();
        room.engine.addEntity(clientObj.ship);

        clientObj.send({ type: "launched" });
        clientObj.send({
          type: "notification",
          message: "Launch sequence completed! Thrusters online.",
          style: "success",
        });
        clientObj.sendStats();
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "trade") {
      if (
        clientObj.ship &&
        clientObj.isLanded &&
        clientObj.planetLandedOn &&
        room
      ) {
        const p = clientObj.planetLandedOn;
        const price = p.market[msg.item];
        if (price === undefined) return;

        if (msg.action === "buy") {
          if (clientObj.ship.credits < price) {
            clientObj.send({
              type: "notification",
              message: "Insufficient credits!",
              style: "error",
            });
            return;
          }
          if (clientObj.ship.addCargo(msg.item, 1)) {
            clientObj.ship.credits -= price;
            room.economyManager.registerBuy(p.name, msg.item);

            clientObj.send({
              type: "notification",
              message: `Purchased 1 ton of ${msg.item} for ${price} CR`,
              style: "success",
            });
            clientObj.sendStats();
            room.broadcast({
              type: "market_sync",
              planetName: p.name,
              market: p.market,
            });
          } else {
            clientObj.send({
              type: "notification",
              message: "Cargo hold is full!",
              style: "error",
            });
          }
        } else if (msg.action === "sell") {
          if (clientObj.ship.removeCargo(msg.item, 1)) {
            clientObj.ship.credits += price;
            room.economyManager.registerSell(p.name, msg.item);

            clientObj.send({
              type: "notification",
              message: `Sold 1 ton of ${msg.item} for ${price} CR`,
              style: "success",
            });
            clientObj.sendStats();
            room.broadcast({
              type: "market_sync",
              planetName: p.name,
              market: p.market,
            });
          } else {
            clientObj.send({
              type: "notification",
              message: `No ${msg.item} in cargo bay!`,
              style: "error",
            });
          }
        }
      }
    } else if (msg.type === "port_service") {
      if (
        clientObj.ship &&
        clientObj.isLanded &&
        clientObj.planetLandedOn &&
        room
      ) {
        const services = clientObj.planetLandedOn.services || {};
        if (msg.service === "repair" && services.repair) {
          const r = applyRepair(clientObj.ship);
          clientObj.send({
            type: "notification",
            message: r.ok
              ? `Hull repaired (+${r.repaired} armor) for ${r.cost} CR.`
              : r.cost > 0
                ? "Insufficient credits to repair hull."
                : "Hull is already at full integrity.",
            style: r.ok ? "success" : "error",
          });
          if (r.ok) clientObj.sendStats();
        } else if (msg.service === "refuel" && services.refuel) {
          const r = applyRefuel(clientObj.ship);
          clientObj.send({
            type: "notification",
            message: r.ok
              ? `Hyperdrive refueled (+${r.refueled}) for ${r.cost} CR.`
              : r.cost > 0
                ? "Insufficient credits to refuel."
                : "Hyperdrive fuel is already full.",
            style: r.ok ? "success" : "error",
          });
          if (r.ok) clientObj.sendStats();
        }
      }
    } else if (msg.type === "jettison") {
      if (clientObj.ship && room) {
        const pod = room.jettisonFromShip(
          clientObj.ship,
          msg.item,
          Number(msg.amount) || 1,
        );
        if (pod) {
          clientObj.send({
            type: "notification",
            message: `Jettisoned ${pod.amount} ton(s) of ${pod.resourceType}.`,
            style: "info",
          });
          clientObj.sendStats();
        } else {
          clientObj.send({
            type: "notification",
            message: "Nothing to jettison.",
            style: "error",
          });
        }
      }
    } else if (msg.type === "outfit_buy") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn) {
        const p = clientObj.planetLandedOn;
        const outfit = p.outfitter.find((o) => o.name === msg.outfitName);
        if (!outfit) return;

        if (clientObj.ship.outfits.includes(outfit.name)) {
          clientObj.send({
            type: "notification",
            message: "Upgrade already equipped!",
            style: "error",
          });
          return;
        }

        if (clientObj.ship.credits < outfit.cost) {
          clientObj.send({
            type: "notification",
            message: "Insufficient credits for upgrade!",
            style: "error",
          });
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
        } else if (outfit.type === "pierce") {
          clientObj.ship.weaponShieldPierce = Math.min(
            1,
            (clientObj.ship.weaponShieldPierce || 0) + outfit.value,
          );
        } else if (outfit.type === "cargo") {
          clientObj.ship.cargoCapacity += outfit.value;
        } else if (outfit.type === "reactor") {
          clientObj.ship.energyRegen += outfit.value;
        } else if (outfit.type === "radiator") {
          clientObj.ship.heatDissipation += outfit.value;
        } else if (outfit.type === "capacitor") {
          clientObj.ship.maxEnergy += outfit.value;
          clientObj.ship.energy = clientObj.ship.maxEnergy;
        } else if (outfit.type === "ramscoop") {
          clientObj.ship.ramscoopRate =
            (clientObj.ship.ramscoopRate || 0) + outfit.value;
        } else if (outfit.type === "fuel") {
          clientObj.ship.maxHyperFuel += outfit.value;
          clientObj.ship.hyperFuel = clientObj.ship.maxHyperFuel;
        } else if (outfit.type === "miner") {
          clientObj.ship.miningYieldMultiplier =
            (clientObj.ship.miningYieldMultiplier || 1) + outfit.value;
        }

        // Bolt the outfit's physical mass onto the hull so handling is the
        // tradeoff for the stat gains: heavier ships accelerate and turn slower.
        if (outfit.mass) {
          clientObj.ship.addOutfitMass(outfit.mass);
        }

        clientObj.send({
          type: "notification",
          message: `Equipped: ${outfit.name}!`,
          style: "success",
        });
        clientObj.sendStats();
      }
    } else if (msg.type === "ship_buy") {
      if (clientObj.ship && clientObj.isLanded && clientObj.planetLandedOn) {
        const p = clientObj.planetLandedOn;
        const s = p.shipyard.find((sh) => sh.name === msg.shipName);
        if (!s) return;

        if (clientObj.ship.credits < s.cost) {
          clientObj.send({
            type: "notification",
            message: "Insufficient credits for ship purchase!",
            style: "error",
          });
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

        clientObj.ship.cargo = {
          food: 0,
          electronics: 0,
          minerals: 0,
          luxuries: 0,
          contraband: 0,
          machinery: 0,
        };

        clientObj.send({
          type: "notification",
          message: `Acquired new ship: ${s.name}!`,
          style: "success",
        });
        clientObj.sendStats();
      }
    } else if (msg.type === "mission_accept") {
      if (
        clientObj.ship &&
        clientObj.isLanded &&
        clientObj.planetLandedOn &&
        room
      ) {
        if (!clientObj.missionManager.availableMissions[msg.planetName]) {
          clientObj.missionManager.generateMissionsForPlanet(
            msg.planetName,
            room.planets,
          );
        }

        const res = clientObj.missionManager.acceptMission(
          msg.planetName,
          msg.missionId,
          clientObj.ship,
        );
        if (res.success) {
          clientObj.send({
            type: "notification",
            message: res.message,
            style: "success",
          });
          clientObj.sendStats();
        } else {
          clientObj.send({
            type: "notification",
            message: res.message,
            style: "error",
          });
        }
      }
    } else if (msg.type === "mission_abandon") {
      if (clientObj.ship) {
        const activeM = clientObj.missionManager.activeMissions.find(
          (m) => m.id === msg.missionId,
        );
        if (activeM) {
          clientObj.missionManager.abandonMission(
            msg.missionId,
            clientObj.ship,
          );
          clientObj.send({
            type: "notification",
            message: `Abandoned contract: ${activeM.title}`,
            style: "info",
          });
          clientObj.sendStats();
        }
      }
    } else if (msg.type === "fleet_create" || msg.type === "fleet_join") {
      const code = (msg.fleetName || "").toUpperCase().trim().substring(0, 10);
      if (!code) {
        clientObj.send({
          type: "notification",
          message: "Invalid Fleet Code!",
          style: "error",
        });
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
          style: "success",
        });

        room.broadcastFleetUpdate(code);
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "fleet_leave") {
      if (clientObj.fleetName && room) {
        const oldCode = clientObj.fleetName;
        room.leaveCurrentFleet(clientObj);
        clientObj.send({
          type: "notification",
          message: `Left fleet: ${oldCode}`,
          style: "info",
        });
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "chat") {
      const channel = msg.channel || "global";
      const text = (msg.text || "").trim().substring(0, 100);
      if (!text) return;

      if (channel === "fleet" && room) {
        if (!clientObj.fleetName) {
          clientObj.send({
            type: "notification",
            message: "You are not in a fleet! Join a fleet to use Fleet comms.",
            style: "error",
          });
          return;
        }

        const fleetSet = room.fleets.get(clientObj.fleetName);
        if (fleetSet) {
          const chatPayload = {
            type: "chat",
            channel: "fleet",
            sender: clientObj.nickname,
            text: text,
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
          text: text,
        };
        for (const c of room.clients.values()) {
          c.send(chatPayload);
        }
      }
    } else if (msg.type === "warp_jump") {
      if (room) {
        const gate = room.engine.getEntity(msg.gateId);
        if (!gate || gate.type !== "warp_gate") {
          clientObj.send({
            type: "notification",
            message: "Warp Gate invalid or not found!",
            style: "error",
          });
          return;
        }
        const dist = clientObj.ship.position.distance(gate.position);
        if (dist > 150) {
          clientObj.send({
            type: "notification",
            message:
              "Too far from stargate to initiate warp jump! Move within 150u.",
            style: "error",
          });
          return;
        }
        if (!canJump(clientObj.ship, JUMP_FUEL_COST)) {
          clientObj.send({
            type: "notification",
            message:
              "Insufficient Hyper-Fuel! Requires 20 units. Land on a planet to refuel.",
            style: "error",
          });
          return;
        }

        consumeJump(clientObj.ship, JUMP_FUEL_COST);
        clientObj.ship.position = gate.targetPosition.clone();
        clientObj.ship.velocity.set(0, 0);

        clientObj.send({
          type: "warp_success",
          targetSector: gate.targetSector,
          position: { x: gate.targetPosition.x, y: gate.targetPosition.y },
          hyperFuel: clientObj.ship.hyperFuel,
        });

        clientObj.send({
          type: "notification",
          message: `Hyperspace drive engaged! Warp transition to ${gate.targetSector.toUpperCase()} Sector completed.`,
          style: "success",
        });

        let escortCount = 0;
        for (const ai of room.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            ai.ship.position = gate.targetPosition.add(
              new Vector2D(
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100,
              ),
            );
            ai.ship.velocity.set(0, 0);
            escortCount++;
          }
        }
        if (escortCount > 0) {
          clientObj.send({
            type: "notification",
            message: `${escortCount} AI escorts made the hyperspace jump with you.`,
            style: "info",
          });
        }

        clientObj.sendStats();
        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "boarding_action") {
      if (room) {
        const target = room.engine.getEntity(msg.targetId);
        if (!target || target.type !== "ship" || !target.isDisabled) {
          clientObj.send({
            type: "notification",
            message: "Target invalid or not disabled!",
            style: "error",
          });
          return;
        }
        const dist = clientObj.ship.position.distance(target.position);
        if (dist > 250) {
          clientObj.send({
            type: "notification",
            message: "Target too far for boarding! Move within 250u.",
            style: "error",
          });
          return;
        }

        if (msg.action === "plunder") {
          const result = plunder(clientObj.ship, target, {
            boardRange: 250,
            maxBoardSpeed: Number.POSITIVE_INFINITY,
          });
          if (result.ok) {
            const tons = Object.values(result.cargo).reduce((a, b) => a + b, 0);
            clientObj.send({
              type: "notification",
              message: `Plundered ${tons} ton(s) of cargo and ${result.credits.toLocaleString()} CR.`,
              style: "success",
            });
            clientObj.sendStats();
          } else {
            clientObj.send({
              type: "notification",
              message:
                "Nothing to plunder — this hulk has already been stripped.",
              style: "info",
            });
          }
        } else if (msg.action === "repair") {
          const result = boardRepair(clientObj.ship, target, {
            boardRange: 250,
            maxBoardSpeed: Number.POSITIVE_INFINITY,
          });
          if (result.ok) {
            clientObj.send({
              type: "notification",
              message: `Boarding repair complete: restored ${result.repaired} armor and revived the ship.`,
              style: "success",
            });
          } else {
            clientObj.send({
              type: "notification",
              message: "Cannot repair: target is not boardable.",
              style: "error",
            });
          }
        } else if (msg.action === "salvage") {
          const salvagable = target.outfits
            ? target.outfits.filter((o) => !clientObj.ship.outfits.includes(o))
            : [];
          if (salvagable.length > 0) {
            const chosen =
              salvagable[Math.floor(Math.random() * salvagable.length)];
            clientObj.ship.outfits.push(chosen);

            const defaultCatalog = [
              {
                name: "Heavy Shields",
                cost: 1200,
                type: "shield",
                value: 350,
                mass: 800,
              },
              {
                name: "Aegis Shield Matrix",
                cost: 4500,
                type: "shield",
                value: 800,
                mass: 1500,
              },
              {
                name: "Overcharged Engines",
                cost: 1500,
                type: "engine",
                value: 12000,
                mass: 200,
              },
              {
                name: "Hyper-Drive Thrusters",
                cost: 3800,
                type: "engine",
                value: 25000,
                mass: 400,
              },
              {
                name: "Plasma Cannon",
                cost: 1800,
                type: "weapon",
                value: 25,
                mass: 300,
              },
              {
                name: "Neutron Blaster",
                cost: 4200,
                type: "weapon",
                value: 55,
                mass: 600,
              },
              {
                name: "Expanded Cargo Holds",
                cost: 1000,
                type: "cargo",
                value: 15,
                mass: 500,
              },
              {
                name: "Sub-space Cargo Compressor",
                cost: 2800,
                type: "cargo",
                value: 45,
                mass: 1200,
              },
              {
                name: "Tractor Beam Matrix",
                cost: 2500,
                type: "tractor",
                value: 250,
                mass: 200,
              },
              {
                name: "Cold-Fusion Reactor",
                cost: 3000,
                type: "reactor",
                value: 30,
                mass: 350,
              },
              {
                name: "Cryo-Cooling Radiator",
                cost: 2200,
                type: "radiator",
                value: 15,
                mass: 250,
              },
              {
                name: "Supercapacitor Cells",
                cost: 1600,
                type: "capacitor",
                value: 100,
                mass: 200,
              },
            ];
            const match = defaultCatalog.find((o) => o.name === chosen);
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
              if (match.mass) {
                clientObj.ship.addOutfitMass(match.mass);
              }
            }

            clientObj.send({
              type: "notification",
              message: `Hull Component Salvaged! Equipped: ${chosen}`,
              style: "success",
            });
            clientObj.sendStats();
          } else {
            clientObj.ship.credits += 800;
            clientObj.send({
              type: "notification",
              message: "No new modules found. Salvaged scrap for +800 CR.",
              style: "info",
            });
            clientObj.sendStats();
          }
        } else if (msg.action === "capture") {
          const fee = 1500;
          if (clientObj.ship.credits < fee) {
            clientObj.send({
              type: "notification",
              message: "Insufficient credits for crew (1,500 CR)!",
              style: "error",
            });
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

          clientObj.send({
            type: "notification",
            message: `Neural Command Link Established! Escort active.`,
            style: "success",
          });
          clientObj.sendStats();
        } else if (msg.action === "scuttle") {
          const scrapReward = Math.floor(
            target.maxArmor * 4 + Math.random() * 200,
          );
          clientObj.ship.credits += scrapReward;
          room.engine.removeEntity(target.id);

          clientObj.send({
            type: "notification",
            message: `Hull scuttled. Salvaged scrap for +${scrapReward} CR`,
            style: "success",
          });
          clientObj.sendStats();
        }

        room.broadcastRosterUpdate();
      }
    } else if (msg.type === "escort_command") {
      if (room) {
        const cmd = msg.command;
        let count = 0;
        for (const ai of room.ais) {
          if (ai.role === "escort" && ai.flagship === clientObj.ship) {
            ai.escortMode = cmd;
            count++;
          }
        }
        clientObj.send({
          type: "notification",
          message: `Transmitted [${cmd.toUpperCase()}] commands to ${count} AI wingmen.`,
          style: "success",
        });
      }
    } else if (msg.type === "ping") {
      clientObj.send({
        type: "pong",
        time: msg.time,
      });
    }
  });

  ws.on("close", () => {
    const activeClient = clients.get(ws) || clientObj;

    activeClient.cleanupTimeout = setTimeout(() => {
      const currentRoom = instances.get(activeClient.roomId);
      // Persist the player's final state before evicting their session from
      // memory; this is the only chance to capture credits/cargo/missions for
      // a returning pilot who reconnects after the server restarts.
      persistenceManager.savePlayer(
        activeClient.id,
        activeClient,
        activeClient.roomId,
      );
      if (currentRoom) {
        currentRoom.leaveCurrentFleet(activeClient);
        if (activeClient.ship) {
          // Also clean up any escorts belonging to this client!
          const escortsToRemove = [];
          for (const ai of currentRoom.ais) {
            if (ai.role === "escort" && ai.flagship === activeClient.ship) {
              escortsToRemove.push(ai);
            }
          }
          for (const ai of escortsToRemove) {
            currentRoom.engine.removeEntity(ai.ship.id);
            const idx = currentRoom.ais.indexOf(ai);
            if (idx !== -1) {
              currentRoom.ais.splice(idx, 1);
            }
          }

          currentRoom.engine.removeEntity(activeClient.id);
        }
        currentRoom.clients.delete(ws);
      }
      clients.delete(ws);
      persistentSessions.delete(activeClient.id);
      if (currentRoom) {
        currentRoom.broadcastNotification(
          `${activeClient.nickname} has left the sector (neural link lost).`,
          "info",
        );
        currentRoom.broadcastRosterUpdate();
      }
      broadcastLobbySync();
    }, 30000);

    clients.delete(ws);
    const currentRoom = instances.get(activeClient.roomId);
    if (currentRoom) {
      currentRoom.broadcastNotification(
        `${activeClient.nickname} neural link disconnected. Standby recovery active...`,
        "warning",
      );
      currentRoom.broadcastRosterUpdate();
    }
  });
});

let activeTunnel = null;

const shutdown = async () => {
  console.log("\n🔌 Shutting down server gracefully...");

  // Snapshot the world (and every connected pilot) to disk before tearing
  // down. The manager swallows errors so a flaky filesystem still lets us
  // proceed with the WS/HTTP teardown.
  persistenceManager.stopAutosave();
  try {
    const savedRooms = await persistenceManager.saveAllGalaxies(
      instances.values(),
    );
    console.log(`💾 Persisted ${savedRooms} galaxy snapshot(s).`);
    let savedPlayers = 0;
    for (const client of clients.values()) {
      if (!client || !client.id || !client.ship) continue;
      const ok = await persistenceManager.savePlayer(
        client.id,
        client,
        client.roomId,
      );
      if (ok) savedPlayers++;
    }
    if (savedPlayers > 0) {
      console.log(`💾 Persisted ${savedPlayers} active player session(s).`);
    }
  } catch (e) {
    console.error("Persistence flush during shutdown failed:", e.message);
  }

  if (activeTunnel) {
    try {
      activeTunnel.close();
      console.log("🛑 Localtunnel closed.");
    } catch (e) {
      console.error("Error closing localtunnel:", e.message);
    }
  }
  wss.close(() => {
    console.log("🛑 WebSocket server closed.");
    server.close(() => {
      console.log("🛑 HTTP server closed.");
      process.exit(0);
    });
  });

  // Force close after 2 seconds
  setTimeout(() => {
    console.log("⚠️ Forcing shutdown after timeout...");
    process.exit(1);
  }, 2000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start listening
server.listen(PORT, async () => {
  console.log(
    `================================================================`,
  );
  console.log(
    `    NEBULA SECTOR AUTHORITATIVE MULTIPLAYER SERVER LISTENING    `,
  );
  console.log(
    `    PORT: ${PORT} | Mode: Authoritative multi-instance rooms    `,
  );
  console.log(
    `    URL: http://localhost:${PORT}                              `,
  );
  console.log(
    `================================================================`,
  );

  // Programmatic localtunnel startup
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_ENV !== "test"
  ) {
    try {
      // localtunnel is an OPTIONAL dependency (not installed by default) so the
      // vulnerable axios it bundles stays out of the dependency tree. Load it
      // lazily; if it is absent the catch below explains the alternatives.
      const { default: localtunnel } = await import("localtunnel");
      console.log(`📡 Spinning up optional localtunnel...`);
      const tunnel = await localtunnel({ port: PORT });
      activeTunnel = tunnel;
      console.log(`🚀 Public Multiplayer URL: ${tunnel.url}`);

      exec(`echo ${tunnel.url} | clip`, (err) => {
        if (!err) {
          console.log(
            "📋 Public URL successfully copied to clipboard! Share it (Ctrl+V) with friends.",
          );
        } else {
          console.log("Could not copy URL to clipboard automatically.");
        }
      });

      tunnel.on("error", (err) => {
        console.error("⚠️ Localtunnel error encountered:", err.message);
      });

      tunnel.on("close", () => {
        console.log("Localtunnel connection closed.");
      });
    } catch (e) {
      console.log(
        `ℹ️  Public tunnel unavailable (${e.message}). localtunnel is optional — ` +
          `install it with \`npm i localtunnel\`, or share your game with ` +
          `\`cloudflared tunnel --url http://localhost:${PORT}\`.`,
      );
    }
  }
});
