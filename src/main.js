import { Vector2D } from "./physics/Vector2D.js";
import { Ship } from "./engine/Ship.js";
import { Planet } from "./engine/Planet.js";
import { SpaceEngine } from "./engine/SpaceEngine.js";
import { SpaceEntity } from "./engine/SpaceEntity.js";
import { AIController } from "./engine/ai/AIController.js";
import { InputHandler } from "./client/InputHandler.js";
import { CanvasRenderer } from "./client/CanvasRenderer.js";
import { UIController } from "./client/UIController.js";
import { SpaceportUI } from "./client/SpaceportUI.js";
import { MissionManager } from "./engine/MissionManager.js";
import { NetworkHandler } from "./client/NetworkHandler.js";
import { NEBULAE } from "./engine/Nebulae.js";
import { EntityInterpolator } from "./client/Interpolator.js";
import { TutorialManager } from "./client/TutorialManager.js";
import SoundEngine from "./client/audio/SoundEngine.js";

// Global game variables
let isLanded = false;
let playerTarget = null;
const ais = [];
const planets = [];
let eventCheckTimer = 0;
const interpolator = new EntityInterpolator();
let empTimer = 0;
let activeSectorEvent = null;
let activeGalaxyEvent = null;

// Endless Sky Navigation & Autopilot state variables
let navTargetSector = null;
let navRoute = [];
let autopilotActive = false;

// Helper to determine sector based on position coordinate thresholds
function getSectorFromPosition(pos) {
  if (!pos) return "core";
  if (pos.x > 10000 && pos.y > 10000) return "frontier";
  if (pos.x < -10000 && pos.y < -10000) return "rim";
  return "core";
}

// BFS shortest path between systems
function calculateShortestPath(from, to) {
  if (!from || !to || from === to) return [];
  if (from === "core") {
    if (to === "frontier") return ["frontier"];
    if (to === "rim") return ["frontier", "rim"];
  }
  if (from === "frontier") {
    if (to === "core") return ["core"];
    if (to === "rim") return ["rim"];
  }
  if (from === "rim") {
    if (to === "frontier") return ["frontier"];
    if (to === "core") return ["frontier", "core"];
  }
  return [];
}

// After completing a warp jump, recalculate the route from the new position
function advanceNavRouteAfterWarp() {
  if (!navTargetSector) return;
  const currentSector = getSectorFromPosition(player.position);
  if (currentSector === navTargetSector) {
    navTargetSector = null;
    navRoute = [];
    uiController.notify(
      "DESTINATION REACHED! Navigation coordinates cleared.",
      "success",
    );
  } else {
    navRoute = calculateShortestPath(currentSector, navTargetSector);
  }
  updateNavigationHUD();
}

// Find the warp gate that connects from current sector to the next hop
function getNextWarpGate(entities) {
  if (!navRoute || navRoute.length === 0) return null;
  const currentSector = getSectorFromPosition(player.position);
  const nextSector = navRoute[0];
  return (
    entities.find(
      (ent) =>
        ent.type === "warp_gate" &&
        ent.sector === currentSector &&
        ent.targetSector === nextSector,
    ) || null
  );
}

const uiController = new UIController();
const initialMuted = localStorage.getItem("audio_muted") === "true";
const soundEffectsEngine = new SoundEngine({ muted: initialMuted });
uiController.soundEffectsEngine = soundEffectsEngine;
const missionManager = new MissionManager();
const spaceportUI = new SpaceportUI(uiController, missionManager);

// Set up Mission Manager event hooks
missionManager.onBountyAccepted = (mission) => {
  const destPlanet = planets.find((p) => p.name === mission.destination);
  if (!destPlanet) return;

  const spawnAngle = Math.random() * Math.PI * 2;
  const spawnDist = destPlanet.landingRadius + 200 + Math.random() * 200;
  const spawnPos = destPlanet.position.add(
    new Vector2D(
      Math.cos(spawnAngle) * spawnDist,
      Math.sin(spawnAngle) * spawnDist,
    ),
  );

  const bossShip = new Ship({
    name: mission.targetName,
    position: spawnPos,
    velocity: new Vector2D(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 40,
    ),
    maxShield: 700,
    maxArmor: 450,
    thrustPower: 22000,
    turnRate: 2.2,
    weaponDamage: 40,
    weaponCooldown: 0.22,
  });

  const controller = new AIController(bossShip, "pirate", {
    useUtilityAdvisor: true,
  });
  engine.addEntity(bossShip);
  ais.push(controller);

  uiController.notify(
    `ALERT: Wanted threat ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
    "error",
  );
};

missionManager.onStorylineStageAdvanced = (mission) => {
  const destPlanet = planets.find((p) => p.name === mission.destination);
  if (!destPlanet) return;

  const spawnAngle = Math.random() * Math.PI * 2;
  const spawnDist = destPlanet.landingRadius + 220 + Math.random() * 150;
  const spawnPos = destPlanet.position.add(
    new Vector2D(
      Math.cos(spawnAngle) * spawnDist,
      Math.sin(spawnAngle) * spawnDist,
    ),
  );

  let bossShip;
  if (mission.stage === 2) {
    // Rival Agent: Fast combat starfighter
    bossShip = new Ship({
      name: mission.targetName,
      position: spawnPos,
      velocity: new Vector2D(
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 50,
      ),
      maxShield: 500,
      maxArmor: 300,
      thrustPower: 26000,
      turnRate: 2.8,
      weaponDamage: 30,
      weaponCooldown: 0.2,
    });
  } else if (mission.stage === 3) {
    // Nebula Dreadnought: Massive combat flagship boss!
    bossShip = new Ship({
      name: mission.targetName,
      position: spawnPos,
      velocity: new Vector2D(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
      ),
      maxShield: 1500,
      maxArmor: 1000,
      thrustPower: 35000,
      turnRate: 1.2,
      weaponDamage: 60,
      weaponCooldown: 0.4,
    });
  }

  const controller = new AIController(bossShip, "pirate", {
    useUtilityAdvisor: true,
  });
  engine.addEntity(bossShip);
  ais.push(controller);

  uiController.notify(
    `STORY ALERT: ${mission.targetName} spotted in orbit of ${destPlanet.name}!`,
    "error",
  );
};

// Initialize Client inputs and renderer
const canvas = document.getElementById("space-canvas");
const renderer = new CanvasRenderer(canvas);
const inputHandler = new InputHandler();

// Start sound engine on first user gesture
const initAudioOnGesture = () => {
  soundEffectsEngine.start();
  window.removeEventListener("click", initAudioOnGesture);
  window.removeEventListener("keydown", initAudioOnGesture);
  window.removeEventListener("touchstart", initAudioOnGesture);
};
window.addEventListener("click", initAudioOnGesture);
window.addEventListener("keydown", initAudioOnGesture);
window.addEventListener("touchstart", initAudioOnGesture);

// Trigger initial viewport size calculations
renderer.resize();
window.addEventListener("resize", () => renderer.resize());

// Initialize physical simulator engine
const engine = new SpaceEngine({ globalDrag: 0.1, restitution: 0.4 });

// Setup player starship
const player = new Ship({
  id: "player",
  name: "Starfarer",
  position: new Vector2D(0, -150), // Start slightly above Sol orbit
  velocity: new Vector2D(0, 0),
  heading: -Math.PI / 2, // point upwards
  maxShield: 200,
  maxArmor: 100,
  credits: 5000,
  cargoCapacity: 20,
  thrustPower: 90000, // ~10.5x faster acceleration over base (3.2x over previous)
  brakePower: 50000, // proportional retro braking for fast stops
  maxSpeed: 1800, // ~6x faster terminal velocity over base (nearly 2x over previous)
  turnRate: 3.2, // snappier turning to complement high-speed steering
});
engine.addEntity(player);

// Initialize solar systems / planets (8 detailed systems)
const solPlanet = new Planet({
  name: "Sol",
  description:
    "The historic cradle of humanity and bustling trade center of the inner systems. High luxury demand, cheap machinery.",
  color: "#4d6fff",
  position: new Vector2D(0, 0),
  radius: 65,
  market: {
    food: 100,
    electronics: 300,
    minerals: 150,
    luxuries: 600,
    contraband: 250,
    machinery: 100,
  },
});
planets.push(solPlanet);
engine.addEntity(solPlanet);

const polarisPlanet = new Planet({
  name: "New Polaris",
  description:
    "An icy frontier industrial colony rich in raw mineral extractions. High food demand, cheap raw minerals.",
  color: "#e0f7fa",
  position: new Vector2D(22000, 18800),
  radius: 55,
  market: {
    food: 220,
    electronics: 320,
    minerals: 50,
    luxuries: 650,
    contraband: 300,
    machinery: 220,
  },
});
planets.push(polarisPlanet);
engine.addEntity(polarisPlanet);

const draconisPlanet = new Planet({
  name: "Sigma Draconis",
  description:
    "A high-tech research outpost specializing in advanced electronics production. Demands minerals, cheap electronics.",
  color: "#00f2fe",
  position: new Vector2D(17800, 21600),
  radius: 60,
  market: {
    food: 120,
    electronics: 120,
    minerals: 250,
    luxuries: 500,
    contraband: 200,
    machinery: 160,
  },
});
planets.push(draconisPlanet);
engine.addEntity(draconisPlanet);

const kaelisPlanet = new Planet({
  name: "Kaelis Colony",
  description:
    "An agricultural breadbasket producing vast food supplies. Demands electronics, cheap food.",
  color: "#00e676",
  position: new Vector2D(-21800, -21800),
  radius: 60,
  market: {
    food: 40,
    electronics: 420,
    minerals: 180,
    luxuries: 550,
    contraband: 280,
    machinery: 190,
  },
});
planets.push(kaelisPlanet);
engine.addEntity(kaelisPlanet);

const aureliaPlanet = new Planet({
  name: "Aurelia Mining Hub",
  description:
    "Outer planetary asteroid refinery. Demands food, produces cheap raw metals and machinery.",
  color: "#ff9100",
  position: new Vector2D(21800, 21800),
  radius: 58,
  market: {
    food: 150,
    electronics: 290,
    minerals: 70,
    luxuries: 580,
    contraband: 260,
    machinery: 150,
  },
});
planets.push(aureliaPlanet);
engine.addEntity(aureliaPlanet);

const tenebrisPlanet = new Planet({
  name: "Tenebris Prime",
  description:
    "A mysterious colony inside a dark nebula. Produces top-tier scientific luxuries, demands electronics.",
  color: "#d500f9",
  position: new Vector2D(-20600, -17600),
  radius: 55,
  market: {
    food: 160,
    electronics: 450,
    minerals: 200,
    luxuries: 220,
    contraband: 400,
    machinery: 240,
  },
});
planets.push(tenebrisPlanet);
engine.addEntity(tenebrisPlanet);

const valkyriePlanet = new Planet({
  name: "Valkyrie Depot",
  description:
    "Core fleet military staging area. Produces high-grade heavy machinery, demands electronics.",
  color: "#ff1744",
  position: new Vector2D(2000, 500),
  radius: 62,
  market: {
    food: 110,
    electronics: 380,
    minerals: 190,
    luxuries: 520,
    contraband: 220,
    machinery: 80,
  },
});
planets.push(valkyriePlanet);
engine.addEntity(valkyriePlanet);

const roguesPlanet = new Planet({
  name: "Rogue's Hollow",
  description:
    "A lawless pirate anchorage hidden deep inside a dense asteroid field. Smuggler contraband is cheap here.",
  color: "#e040fb",
  position: new Vector2D(-22800, -20500),
  radius: 52,
  market: {
    food: 250,
    electronics: 220,
    minerals: 160,
    luxuries: 450,
    contraband: 60,
    machinery: 180,
  },
});
planets.push(roguesPlanet);
engine.addEntity(roguesPlanet);

// Generate drifting spinning asteroids (including Rare Gem Asteroids)
const asteroidCount = 45;
for (let i = 0; i < asteroidCount; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 500 + Math.random() * 3200;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;

  const vx = (Math.random() - 0.5) * 40;
  const vy = (Math.random() - 0.5) * 40;
  const spin = (Math.random() - 0.5) * 0.8;
  const size = 18 + Math.random() * 20;

  const isGem = Math.random() < 0.25; // 25% Gem Asteroids
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

// Generate NPC faction fleets
// 1. Spawning AI Faction Merchants
const merchantNames = [
  "Atlas Hauler",
  "Hermes Cargo",
  "Heavy Freighter",
  "Behemoth",
  "Voyager Hauler",
  "Galleon",
];
for (let i = 0; i < 8; i++) {
  const spawnPlanet = planets[i % planets.length];
  const spawnPos = spawnPlanet.position.add(
    new Vector2D((Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400),
  );

  // Merchants use Cargo Hauler or Heavy Freighter stats
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

  const controller = new AIController(mShip, "merchant", {
    useUtilityAdvisor: true,
  });
  engine.addEntity(mShip);
  ais.push(controller);
}

// 2. Spawning AI Pirate Raiders
const pirateNames = [
  "Pirate Raider",
  "Viper Scout",
  "Marauder",
  "Corsair Star",
  "Gallows Destroyer",
];
for (let i = 0; i < 7; i++) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1000 + Math.random() * 2000;
  const spawnPos = new Vector2D(Math.cos(angle) * dist, Math.sin(angle) * dist);

  // Pirates use Courier, Star Fighter or military-grade hulls
  const isHeavy = i === 6; // boss pirate
  const pShip = new Ship({
    name: isHeavy ? "Pirate Boss Gallows" : pirateNames[i % pirateNames.length],
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

  const controller = new AIController(pShip, "pirate", {
    useUtilityAdvisor: true,
  });
  engine.addEntity(pShip);
  ais.push(controller);
}

// 3. Spawning AI System Guards
const guardNames = [
  "System Guard",
  "Sector Police",
  "Navy Destroyer",
  "Aegis Cruiser",
  "Defense Sentinel",
  "Patrol Frigate",
];
for (let i = 0; i < 6; i++) {
  const spawnPlanet = planets[i % planets.length];
  const spawnPos = spawnPlanet.position.add(
    new Vector2D((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200),
  );

  // Guards use military destroyer hulls
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

  const controller = new AIController(gShip, "guard", {
    useUtilityAdvisor: true,
  });
  engine.addEntity(gShip);
  ais.push(controller);
}

// Spark particle trigger hooks
engine.onProjectileFired = (proj, ship) => {
  // Spawn subtle exhaust flash when lasers fire
  const dir = ship.getDirectionVector();
  const muzzleX = ship.position.x + dir.x * (ship.radius + 2);
  const muzzleY = ship.position.y + dir.y * (ship.radius + 2);
  renderer.spawnExplosion(
    muzzleX,
    muzzleY,
    ship.id === "player" ? "#00ffcc" : "#ff3333",
  );

  let weaponType = "laser";
  if (ship && ship.outfits) {
    const outfitsLower = ship.outfits.map((o) =>
      typeof o === "string" ? o.toLowerCase() : "",
    );
    if (outfitsLower.some((o) => o.includes("plasma"))) {
      weaponType = "plasma";
    } else if (outfitsLower.some((o) => o.includes("neutron"))) {
      weaponType = "neutron";
    } else if (outfitsLower.some((o) => o.includes("ion"))) {
      weaponType = "ion";
    }
  }
  soundEffectsEngine.playWeapon(weaponType, ship.position);
};

engine.onEntityDestroyed = (ent) => {
  if (ent.type === "projectile") return;

  // Determine explosion colors based on faction and type
  let color = "#ff4a1c"; // orange-red for regular ships
  if (ent.type === "generic") {
    color = "#888c94"; // grey debris dust for asteroids
  } else if (ent.type === "gem_asteroid") {
    const hashVal = ent.id ? ent.id.charCodeAt(0) : 0;
    color = hashVal % 2 === 0 ? "#ffd700" : "#00ff66"; // Gold or emerald sparkling flash
  } else if (ent.id === "player") {
    color = "#00ffff"; // electric blue for player shield explosion
  } else if (
    ent.name &&
    (ent.name === "Pirate Raider" || ent.name.includes("Pirate"))
  ) {
    color = "#ff3b30"; // blood red for pirate raiders
  }

  // Trigger high-fidelity vector explosion
  renderer.spawnExplosion(ent.position.x, ent.position.y, color);

  // Award player on targets destruction (offline only)
  if (!window.network) {
    if (ent.type === "generic" || ent.type === "gem_asteroid") {
      if (ent.type === "gem_asteroid") {
        const added = player.addCargo("luxuries", 1);
        if (added) {
          uiController.notify(
            "Rare Gem Asteroid shattered! Yielded 1 unit of high-value luxuries cargo.",
            "success",
          );
        } else {
          player.credits += 500;
          uiController.notify(
            "Rare Gem Asteroid shattered! Cargo full, minerals sold immediately for 500 CR.",
            "info",
          );
        }
      } else {
        player.credits += 250;
        uiController.notify(
          "Asteroid shattered! Recovered 250 CR minerals.",
          "success",
        );
      }
    } else if (ent.type === "ship") {
      // Check if this ship satisfies an active bounty mission
      const completedBounty = missionManager.checkBountyCompletion(
        ent.name,
        player,
      );
      if (completedBounty) {
        if (completedBounty.campaignCompleted) {
          uiController.notify(completedBounty.message, "success");
          // Trigger massive gold-colored fireworks explosion visuals
          for (let i = 0; i < 8; i++) {
            setTimeout(() => {
              renderer.spawnExplosion(
                player.position.x + (Math.random() - 0.5) * 200,
                player.position.y + (Math.random() - 0.5) * 200,
                "#ffd700",
              );
            }, i * 200);
          }
        } else if (completedBounty.stageAdvanced) {
          uiController.notify(completedBounty.message, "success");
        } else {
          uiController.notify(
            `Contract Completed: Bounty for ${completedBounty.targetName} claimed! +${completedBounty.reward.toLocaleString()} CR`,
            "success",
          );
        }
        uiController.updateActiveMissionsHUD(missionManager.activeMissions);
      }

      if (
        ent.name &&
        (ent.name === "Pirate Raider" || ent.name.includes("Pirate"))
      ) {
        player.credits += 1000;
        uiController.notify(
          `${ent.name} neutralized! Bounty claimed +1,000 CR`,
          "success",
        );
      } else {
        uiController.notify(
          `${ent.name} has been destroyed in combat.`,
          "info",
        );
      }

      // Clean from active target scanner
      if (playerTarget === ent) {
        playerTarget = null;
      }
    }
  } else {
    // In multiplayer, just clean up targets locally if destroyed
    if (playerTarget === ent) {
      playerTarget = null;
    }
  }

  // Handle Player Death Respawn sequence (offline only)
  if (ent.id === "player" && !window.network) {
    handlePlayerRespawn();
  }
};

/**
 * Initiates the player respawn cycle at Sol spaceport with 10% credit insurance fee.
 */
function handlePlayerRespawn() {
  uiController.notify(
    "CRITICAL ERROR: Reactor core compromised! Ejecting capsule...",
    "error",
  );

  setTimeout(() => {
    // 10% financial penalty
    const insuranceFee = Math.floor(player.credits * 0.1);
    player.credits = Math.max(0, player.credits - insuranceFee);

    // Revive and reset player properties
    player.armor = player.maxArmor;
    player.shield = player.maxShield;
    player.position = new Vector2D(0, -150); // orbit coordinates above Sol
    player.velocity = new Vector2D(0, 0);
    player.heading = -Math.PI / 2;
    player.clearControls();

    engine.addEntity(player);
    uiController.notify(
      `Cloned replacement hull activated at Sol. Insurance fee: ${insuranceFee.toLocaleString()} CR.`,
      "info",
    );
  }, 3000);
}

// Binds stargate warp hooks (Endless Sky hyperlane travel + autopilot)
inputHandler.onWarpPressed = () => {
  if (isLanded) return;
  if (renderer.isWarping) return;

  // Search if currently in suitable proximity of any warp gate
  const gate = engine.entities.find(
    (ent) =>
      ent.type === "warp_gate" && player.position.distance(ent.position) <= 150,
  );
  if (gate) {
    // Disengage autopilot on manual warp entry
    autopilotActive = false;
    updateNavigationHUD();

    if (window.network) {
      if (window.network.connected) {
        window.network.send({
          type: "warp_jump",
          gateId: gate.id,
        });
      } else {
        uiController.notify(
          "Neural link offline! Cannot engage hyperspace warp.",
          "error",
        );
      }
      return;
    }

    // Offline / single-player fallback jump logic
    if (player.hyperFuel < 20) {
      uiController.notify(
        "Insufficient Hyper-Fuel! Requires 20 units. Land on a planet to refuel.",
        "error",
      );
      return;
    }

    // Process offline warp jump
    player.hyperFuel = Math.max(0, player.hyperFuel - 20);
    renderer.isWarping = true;
    renderer.warpTimer = 0;
    renderer.warpTunnelStars = [];
    player.clearControls();
    soundEffectsEngine.playWarpJump();

    uiController.notify(
      `Entering Hyperlane Warp Drive to ${gate.targetSector.toUpperCase()} Sector!`,
      "success",
    );

    setTimeout(() => {
      renderer.isWarping = false;
      player.position = gate.targetPosition.clone();
      player.velocity = new Vector2D(0, 0);
      uiController.notify(
        "Warp drive disengaged. Sector transition complete.",
        "info",
      );

      // Advance navigation route after successful warp jump
      advanceNavRouteAfterWarp();
    }, 2000);
  } else if (navTargetSector && navRoute.length > 0) {
    // No gate in range but navigation target exists — toggle autopilot
    autopilotActive = !autopilotActive;
    if (autopilotActive) {
      uiController.notify(
        "Hyperspace autopilot ENGAGED. Press [J] again or steer manually to disengage.",
        "success",
      );
    } else {
      uiController.notify(
        "Hyperspace autopilot disengaged. Manual control restored.",
        "info",
      );
    }
    updateNavigationHUD();
  } else {
    uiController.notify(
      "No hyperlane stargate portal within range! Open the Galaxy Map [M] to plot a course.",
      "error",
    );
  }
};

// Binds planetary landing hooks
inputHandler.onLandPressed = () => {
  if (isLanded) return;

  if (window.network) {
    if (window.network.connected) {
      window.network.requestLanding();
    } else {
      uiController.notify(
        "Neural link offline! Cannot land right now.",
        "error",
      );
    }
    return;
  }

  // Search if currently in suitable proximity of any planet
  const targetPlanet = planets.find((p) => p.canLand(player));
  if (targetPlanet) {
    // 1. Complete active delivery / smuggling contracts on arrival
    const completed = missionManager.checkArrivalCompletions(
      targetPlanet.name,
      player,
    );
    for (const m of completed) {
      uiController.notify(
        `Contract Completed: ${m.title}! Received +${m.reward.toLocaleString()} CR`,
        "success",
      );
    }
    uiController.updateActiveMissionsHUD(missionManager.activeMissions);

    // 2. SECURITY SCAN check for contraband on core planets (any planet except Rogue's Hollow)
    if (targetPlanet.name !== "Rogue's Hollow" && player.cargo.contraband > 0) {
      player.cargo.contraband = 0;
      player.credits = Math.max(0, player.credits - 1500);
      uiController.notify(
        "Security Scan: Contraband detected! Confiscated and fined 1,500 CR.",
        "error",
      );
    }

    isLanded = true;
    player.velocity = new Vector2D(0, 0);
    player.clearControls();

    // Open glassmorphic trading/outfit spaceport screen
    spaceportUI.open(player, targetPlanet, planets);
    if (soundEffectsEngine) {
      soundEffectsEngine.playDock();
    }
    uiController.notify(
      `Landed safely on ${targetPlanet.name}. Ship systems secured.`,
      "success",
    );
  } else {
    uiController.notify(
      "Cannot land here. Travel within trigger radius at low speed (< 80 u/s).",
      "error",
    );
  }
};

// Bind launch callback to resume game simulation
spaceportUI.onLaunch = () => {
  isLanded = false;
  if (soundEffectsEngine) {
    soundEffectsEngine.playUndock();
  }

  // Reposition ship slightly outside the planet coordinate radius to prevent immediately re-landing
  const targetPlanet = spaceportUI.planet;
  if (targetPlanet) {
    player.position = targetPlanet.position.add(
      new Vector2D(0, targetPlanet.landingRadius + 30),
    );
  }
  player.velocity = new Vector2D(0, 0);
  player.clearControls();

  uiController.notify(
    "Launch sequence completed! Thrusters online.",
    "success",
  );
};

// Target Selection cycle listeners
inputHandler.onTargetPressed = () => {
  const localId = (window.network && window.network.playerId) || "player";
  // Pull all active ships excluding player
  const candidateShips = engine.entities.filter(
    (ent) => ent.type === "ship" && ent.id !== localId && !ent.isDestroyed,
  );

  if (candidateShips.length === 0) {
    playerTarget = null;
    uiController.notify("No scanner signals detected in range.", "error");
    return;
  }

  // Cycle sequentially
  if (!playerTarget || !candidateShips.includes(playerTarget)) {
    playerTarget = candidateShips[0];
  } else {
    const currentIndex = candidateShips.indexOf(playerTarget);
    const nextIndex = (currentIndex + 1) % candidateShips.length;
    playerTarget = candidateShips[nextIndex];
  }

  uiController.notify(`Scanners locked: ${playerTarget.name}`, "info");

  // Track target lock during tutorial
  if (
    playerTarget &&
    playerTarget.name === "Training Drone" &&
    window.tutorialManager &&
    window.tutorialManager.isActive &&
    window.tutorialManager.currentStep === "lock_target"
  ) {
    if (window.network && window.network.connected) {
      window.network.send({ type: "tutorial_progress", step: "destroy_drone" });
    }
  }
};

inputHandler.onHostilePressed = () => {
  // Pull active hostile pirate ships
  const hostiles = engine.entities.filter(
    (ent) => ent.name === "Pirate Raider" && !ent.isDestroyed,
  );

  if (hostiles.length === 0) {
    uiController.notify("No hostiles registered in local sector.", "success");
    return;
  }

  // Lock the closest hostile pirate ship
  let closestPirate = null;
  let closestDist = Infinity;

  for (const pirate of hostiles) {
    const dist = player.position.distance(pirate.position);
    if (dist < closestDist) {
      closestDist = dist;
      closestPirate = pirate;
    }
  }

  if (closestPirate) {
    playerTarget = closestPirate;
    uiController.notify(
      `WARNING: Locked threat vector: ${playerTarget.name}`,
      "error",
    );
  }
};

// Startup menu bindings
const welcomeScreen = document.getElementById("welcome-screen");
const btnStart = document.getElementById("btn-start");
const btnCreateSector = document.getElementById("btn-create-sector");
const newSectorNameInput = document.getElementById("new-sector-name");
const pilotCallsignEl = document.getElementById("pilot-callsign");

// Load callsigns from local storage if existing
const cachedCallsign = localStorage.getItem("nebula_callsign");
if (cachedCallsign && pilotCallsignEl) {
  pilotCallsignEl.value = cachedCallsign;
}

btnStart.addEventListener("click", () => {
  joinRoom("public");
});

// Enter key quick-join from callsign input field
if (pilotCallsignEl) {
  pilotCallsignEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      joinRoom("public");
    }
  });
}

// Enter key from sector name field creates room
if (newSectorNameInput) {
  newSectorNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnCreateSector?.click();
    }
  });
}

btnCreateSector?.addEventListener("click", () => {
  const sectorName = newSectorNameInput ? newSectorNameInput.value.trim() : "";
  if (!sectorName) {
    uiController.notify("Please enter a custom sector name first!", "error");
    return;
  }

  const pilotCallsign = pilotCallsignEl
    ? pilotCallsignEl.value.trim()
    : "Commander";
  localStorage.setItem("nebula_callsign", pilotCallsign);
  network.nickname = pilotCallsign;

  network.send({
    type: "create_room",
    name: sectorName,
    nickname: pilotCallsign,
  });
});

function joinRoom(roomId) {
  const pilotCallsign = pilotCallsignEl
    ? pilotCallsignEl.value.trim()
    : "Commander";
  localStorage.setItem("nebula_callsign", pilotCallsign);
  network.nickname = pilotCallsign;

  network.send({
    type: "join_room",
    roomId: roomId,
    nickname: pilotCallsign,
  });
}

// URL parameter direct room joining: ?room=roomId
const urlParams = new URLSearchParams(window.location.search);
const directRoomId = urlParams.get("room");
let pendingDirectJoin = directRoomId || null;

/**
 * Triggers a procedural dynamic event in local space.
 */
function triggerRandomSpaceEvent() {
  const rand = Math.random();
  if (rand < 0.3) {
    // 1. Solar Storm / EMP Event
    empTimer = 15; // 15 seconds duration
    uiController.notify(
      "WARNING: Solar EMP Flare detected! Shields offline, thrust power halved!",
      "error",
    );
  } else if (rand < 0.65) {
    // 2. Merchant Distress Call
    uiController.notify(
      "DISTRESS SIGNAL: Civilian freighter under pirate raider ambush nearby!",
      "error",
    );

    // Spawn distressed freighter near player
    const angleF = Math.random() * Math.PI * 2;
    const spawnPosF = player.position.add(
      new Vector2D(Math.cos(angleF) * 500, Math.sin(angleF) * 500),
    );

    const distressedMerchant = new Ship({
      name: "Distress Freighter",
      position: spawnPosF,
      velocity: new Vector2D(0, 0),
      maxShield: 400,
      maxArmor: 250,
      thrustPower: 12000,
      turnRate: 1.5,
    });

    const mController = new AIController(distressedMerchant, "merchant", {
      useUtilityAdvisor: true,
    });
    engine.addEntity(distressedMerchant);
    ais.push(mController);

    // Spawn 1-2 pirate raiders attacking it
    const pirateCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < pirateCount; i++) {
      const angleP = Math.random() * Math.PI * 2;
      const spawnPosP = spawnPosF.add(
        new Vector2D(Math.cos(angleP) * 150, Math.sin(angleP) * 150),
      );

      const attacker = new Ship({
        name: `Distress Raider #${i + 1}`,
        position: spawnPosP,
        velocity: new Vector2D(0, 0),
        maxShield: 200,
        maxArmor: 100,
        thrustPower: 10000,
        turnRate: 2.5,
        weaponDamage: 15,
        weaponCooldown: 0.3,
      });

      // Make pirate attack the merchant
      const pController = new AIController(attacker, "pirate", {
        useUtilityAdvisor: true,
      });
      pController.target = distressedMerchant;

      engine.addEntity(attacker);
      ais.push(pController);
    }
  } else if (rand < 0.9) {
    // 3. Wormhole Anomaly
    uiController.notify(
      "WARNING: Spatial anomaly detected! Wormhole gravity rift has teleported ship!",
      "info",
    );

    // Teleport player to random far coordinates
    const warpX = (Math.random() - 0.5) * 5000;
    const warpY = (Math.random() - 0.5) * 5000;
    player.position = new Vector2D(warpX, warpY);
    player.velocity = new Vector2D(0, 0);

    // Spawn a couple of Gem Asteroids around player for rewards
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const pos = player.position.add(
        new Vector2D(
          Math.cos(angle) * (150 + Math.random() * 100),
          Math.sin(angle) * (150 + Math.random() * 100),
        ),
      );
      const gem = new SpaceEntity({
        type: "gem_asteroid",
        position: pos,
        velocity: new Vector2D(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
        ),
        mass: 600,
        radius: 20,
      });
      engine.addEntity(gem);
    }

    // Flash explosion visual at player new coordinates
    renderer.spawnExplosion(player.position.x, player.position.y, "#9b5de5");
  }
}

// ==========================================
// MULTIPLAYER NETWORKING & STATE SYNC SETUP
// ==========================================

const network = new NetworkHandler();
window.network = network;

const tutorialManager = new TutorialManager({
  player,
  uiController,
  inputHandler,
  spaceportUI,
  renderer,
  network,
});
window.tutorialManager = tutorialManager;

// Keep client physics entities completely in sync with authoritative server coordinates
function syncEntitiesFromServer(serverEntities) {
  const localId = (network && network.playerId) || "player";

  // Track IDs from server update
  const serverIds = new Set(serverEntities.map((e) => e.id));

  // 1. Clean up local entities (except planets and local player ship) that are destroyed or left
  const toRemove = [];
  for (const ent of engine.entities) {
    if (ent.type === "planet") continue;
    if (ent.id === localId) continue;

    if (!serverIds.has(ent.id)) {
      toRemove.push(ent);
    }
  }

  for (const ent of toRemove) {
    engine.removeEntity(ent);
    interpolator.remove(ent.id);
    if (
      ent.type === "ship" ||
      ent.type === "generic" ||
      ent.type === "gem_asteroid"
    ) {
      if (typeof engine.onEntityDestroyed === "function") {
        engine.onEntityDestroyed(ent);
      }
    }
  }

  // 2. Synchronize current properties or instantiate brand new ones
  for (const ent of serverEntities) {
    if (ent.id !== localId) {
      interpolator.push(ent.id, Date.now(), ent.x, ent.y, ent.heading);
    }
    let localEnt = engine.entities.find((e) => e.id === ent.id);

    if (localEnt) {
      if (ent.id === localId) {
        // Client-side prediction reconciliation for local player coordinates
        const serverPos = new Vector2D(ent.x, ent.y);
        const dist = localEnt.position.distance(serverPos);
        if (dist > 150) {
          localEnt.position = serverPos; // hard correction
        } else {
          localEnt.position = localEnt.position
            .multiply(0.85)
            .add(serverPos.multiply(0.15)); // soft blend
        }
        localEnt.velocity = new Vector2D(ent.vx, ent.vy);
        localEnt.shield = ent.shield;
        localEnt.maxShield = ent.maxShield;
        localEnt.armor = ent.armor;
        localEnt.maxArmor = ent.maxArmor;
        localEnt.energy = ent.energy;
        localEnt.maxEnergy = ent.maxEnergy;
        localEnt.heat = ent.heat;
        localEnt.maxHeat = ent.maxHeat;
        localEnt.isOverheated = ent.isOverheated;
        localEnt.isDisabled = ent.isDisabled;
      } else {
        // Velocity-aware dead reckoning with adaptive correction
        const serverPos = new Vector2D(ent.x, ent.y);
        const errorDist = localEnt.position.distance(serverPos);

        if (errorDist > 200) {
          // Hard snap for large desync (e.g., warp jumps, respawns)
          localEnt.position = serverPos;
        } else {
          // Adaptive blend: correct more aggressively the farther off we are
          const correctionStrength = Math.min(0.5, 0.1 + errorDist / 500);
          localEnt.position = localEnt.position
            .multiply(1 - correctionStrength)
            .add(serverPos.multiply(correctionStrength));
        }

        localEnt.velocity = new Vector2D(ent.vx, ent.vy);
        localEnt.heading = ent.heading;
        localEnt.radius = ent.radius;

        if (localEnt.type === "ship") {
          localEnt.name = ent.name;
          localEnt.shield = ent.shield;
          localEnt.maxShield = ent.maxShield;
          localEnt.armor = ent.armor;
          localEnt.maxArmor = ent.maxArmor;
          localEnt.controls = ent.controls;
          localEnt.energy = ent.energy;
          localEnt.maxEnergy = ent.maxEnergy;
          localEnt.heat = ent.heat;
          localEnt.maxHeat = ent.maxHeat;
          localEnt.isOverheated = ent.isOverheated;
          localEnt.isDisabled = ent.isDisabled;
          localEnt.outfits = ent.outfits || [];
        } else if (localEnt.type === "cargo_pod") {
          localEnt.resourceType = ent.resourceType;
          localEnt.amount = ent.amount;
        }
      }
    } else {
      // Add new entity
      if (ent.id === localId) {
        player.id = localId;
        player.position = new Vector2D(ent.x, ent.y);
        player.velocity = new Vector2D(ent.vx, ent.vy);
        player.heading = ent.heading;
        player.radius = ent.radius;
        player.shield = ent.shield;
        player.maxShield = ent.maxShield;
        player.armor = ent.armor;
        player.maxArmor = ent.maxArmor;
        player.energy = ent.energy;
        player.maxEnergy = ent.maxEnergy;
        player.heat = ent.heat;
        player.maxHeat = ent.maxHeat;
        player.isOverheated = ent.isOverheated;
        player.isDisabled = ent.isDisabled;
      } else if (ent.type === "ship") {
        const newShip = new Ship({
          id: ent.id,
          name: ent.name,
          position: new Vector2D(ent.x, ent.y),
          velocity: new Vector2D(ent.vx, ent.vy),
          heading: ent.heading,
          radius: ent.radius,
          maxShield: ent.maxShield,
          maxArmor: ent.maxArmor,
        });
        newShip.shield = ent.shield;
        newShip.armor = ent.armor;
        newShip.energy = ent.energy;
        newShip.maxEnergy = ent.maxEnergy;
        newShip.heat = ent.heat;
        newShip.maxHeat = ent.maxHeat;
        newShip.isOverheated = ent.isOverheated;
        newShip.isDisabled = ent.isDisabled;
        newShip.outfits = ent.outfits || [];
        newShip.controls = ent.controls || {
          isThrusting: false,
          isBraking: false,
          isFiring: false,
        };
        engine.addEntity(newShip);
      } else if (ent.type === "projectile") {
        const newProj = new SpaceEntity({
          id: ent.id,
          type: "projectile",
          position: new Vector2D(ent.x, ent.y),
          velocity: new Vector2D(ent.vx, ent.vy),
          radius: ent.radius,
          heading: ent.heading,
        });
        newProj.ownerId = ent.ownerId;
        newProj.damage = ent.damage;
        newProj.shieldPierce = ent.shieldPierce;
        engine.addEntity(newProj);
      } else if (ent.type === "cargo_pod") {
        const newPod = new SpaceEntity({
          id: ent.id,
          type: "cargo_pod",
          position: new Vector2D(ent.x, ent.y),
          velocity: new Vector2D(ent.vx, ent.vy),
          radius: ent.radius,
          heading: ent.heading,
        });
        newPod.resourceType = ent.resourceType;
        newPod.amount = ent.amount;
        engine.addEntity(newPod);
      } else {
        const newAsteroid = new SpaceEntity({
          id: ent.id,
          type: ent.type,
          position: new Vector2D(ent.x, ent.y),
          velocity: new Vector2D(ent.vx, ent.vy),
          radius: ent.radius,
          heading: ent.heading,
        });
        engine.addEntity(newAsteroid);
      }
    }
  }
}

// Bind WebSocket network lifecycle listeners
network.onInit = (msg) => {
  player.id = msg.playerId;
  player.name = msg.nickname;
  network.tutorialCompleted = !!msg.tutorialCompleted;
  interpolator.clear();

  if (msg.roomId) {
    // Dismiss lobby overlay with smooth fade-out animation
    welcomeScreen.classList.add("fade-out");
    setTimeout(() => {
      welcomeScreen.classList.remove("visible");
      welcomeScreen.classList.remove("fade-out");

      if (window.tutorialManager) {
        window.tutorialManager.checkOnboarding();
      }
    }, 500);

    uiController.notify(
      `Connected to sector [${msg.roomName.toUpperCase()}]! Systems nominal.`,
      "success",
    );

    // Kick off high precision animation loop if not already started
    if (lastTime === 0) {
      lastTime = 0;
      requestAnimationFrame(gameLoop);
    }
  } else {
    // No room assigned yet — we're in the lobby
    // Check if there's a pending URL-based direct join
    if (pendingDirectJoin) {
      const targetRoom = pendingDirectJoin;
      pendingDirectJoin = null;
      joinRoom(targetRoom);
    }
  }
};

network.onLobbySync = (msg) => {
  if (msg.rooms) {
    const lobbyRows = document.getElementById("lobby-rows");
    if (lobbyRows) {
      if (msg.rooms.length === 0) {
        lobbyRows.innerHTML = `<tr><td colspan="3" class="text-center" style="color: var(--color-text-secondary); font-size: 11px;">No custom sectors active. Type a name below to launch one!</td></tr>`;
      } else {
        lobbyRows.innerHTML = "";
        for (const room of msg.rooms) {
          const tr = document.createElement("tr");
          const roomUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room.id)}`;
          tr.innerHTML = `
            <td style="font-weight: 600; color: #ffffff; text-align: left;">${room.name.toUpperCase()}</td>
            <td style="text-align: left;"><span class="badge-pilots">${room.playersCount} online</span></td>
            <td style="text-align: right; display: flex; gap: 5px; justify-content: flex-end;">
              <button class="btn-copy-room-link btn-sm" data-room-url="${roomUrl}" title="Copy invite link" style="padding: 4px 8px; border-radius: 4px; font-size: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: var(--color-text-secondary); cursor: pointer;">📋</button>
              <button class="btn-primary btn-sm btn-join-room" data-room-id="${room.id}" style="padding: 4px 10px; border-radius: 4px; font-size: 10px;">JOIN SECTOR</button>
            </td>
          `;
          lobbyRows.appendChild(tr);
        }

        // Wire join buttons
        document.querySelectorAll(".btn-join-room").forEach((btn) => {
          btn.addEventListener("click", () => {
            const roomId = btn.getAttribute("data-room-id");
            joinRoom(roomId);
          });
        });

        // Wire copy link buttons
        document.querySelectorAll(".btn-copy-room-link").forEach((btn) => {
          btn.addEventListener("click", () => {
            const url = btn.getAttribute("data-room-url");
            navigator.clipboard
              .writeText(url)
              .then(() => {
                btn.textContent = "✅";
                setTimeout(() => {
                  btn.textContent = "📋";
                }, 1500);
                uiController.notify(
                  "Invite link copied to clipboard!",
                  "success",
                );
              })
              .catch(() => {
                uiController.notify(
                  "Failed to copy link. Try manually.",
                  "error",
                );
              });
          });
        });
      }
    }
  }

  if (msg.roster) {
    const elCount = document.getElementById("net-pilots-count");
    if (elCount) {
      elCount.innerText = `${msg.count} PILOT${msg.count !== 1 ? "S" : ""}`;
    }

    const elList = document.getElementById("net-roster-list");
    if (elList) {
      elList.innerHTML = "";
      msg.roster.forEach((pilot) => {
        const card = document.createElement("div");
        card.className = "roster-card";
        if (pilot.id === player.id) {
          card.classList.add("self");
        }
        if (pilot.status === "standby") {
          card.classList.add("standby");
        }

        const pilotNameText = pilot.fleetName
          ? `[${pilot.fleetName}] ${pilot.nickname}`
          : pilot.nickname;

        card.innerHTML = `
          <div class="roster-pilot-info">
            <div class="roster-pilot-name">${pilotNameText} ${pilot.id === player.id ? '<span style="color: var(--color-cyan); font-size: 8px;">(YOU)</span>' : ""}</div>
            <div class="roster-pilot-credits">${pilot.credits.toLocaleString()} CR</div>
          </div>
          <span class="roster-pilot-status roster-status-${pilot.status}">${pilot.status}</span>
        `;
        elList.appendChild(card);
      });
    }
  }
};

network.onStateReceived = (serverEntities) => {
  syncEntitiesFromServer(serverEntities);
};

network.onStatsReceived = (msg) => {
  player.credits = msg.credits;
  player.shield = msg.shield;
  player.maxShield = msg.maxShield;
  player.armor = msg.armor;
  player.maxArmor = msg.maxArmor;
  player.cargoCapacity = msg.cargoCapacity;
  player.cargo = msg.cargo;
  player.outfits = msg.outfits;
  player.bountyVouchers = msg.bountyVouchers || [];
  player.standings = msg.standings || {};
  player.squad = msg.squad || [];
  player.weaponDamage = msg.weaponDamage;
  player.weaponCooldown = msg.weaponCooldown;
  player.thrustPower = msg.thrustPower;
  player.maxSpeed = msg.maxSpeed;
  player.name = msg.nickname;
  player.hullMass = msg.hullMass;
  player.outfitMass = msg.outfitMass;
  player.mass = msg.mass;
  player.maxOutfitMass = msg.maxOutfitMass;
  player.effectiveTurnRate = msg.effectiveTurnRate;
  player.effectiveMaxSpeed = msg.effectiveMaxSpeed;
  player.thrustToMass = msg.thrustToMass;
  player.chargeDuration = msg.chargeDuration;

  // Endless Sky variables mapping
  player.energy = msg.energy;
  player.maxEnergy = msg.maxEnergy;
  player.heat = msg.heat;
  player.maxHeat = msg.maxHeat;
  player.hyperFuel = msg.hyperFuel;
  player.maxHyperFuel = msg.maxHyperFuel;
  player.isOverheated = msg.isOverheated;
  player.isDisabled = msg.isDisabled;

  if (msg.activeMissions) {
    missionManager.activeMissions = msg.activeMissions;
    uiController.updateActiveMissionsHUD(missionManager.activeMissions);
  }

  uiController.update(
    player,
    playerTarget,
    planets,
    NEBULAE,
    engine.entities,
    missionManager ? missionManager.activeMissions : [],
    navTargetSector,
    navRoute,
  );
  spaceportUI.refreshActiveTab();
};

network.onLanded = (msg) => {
  isLanded = true;
  player.velocity = new Vector2D(0, 0);
  player.clearControls();

  if (msg.availableMissions) {
    missionManager.availableMissions[msg.planetName] = msg.availableMissions;
  }

  const targetPlanet = planets.find((p) => p.name === msg.planetName);
  if (targetPlanet) {
    spaceportUI.open(player, targetPlanet, planets);
    if (soundEffectsEngine) {
      soundEffectsEngine.playDock();
    }
    uiController.notify(
      `Landed safely on ${targetPlanet.name}. Ship systems secured.`,
      "success",
    );
  }
};

network.onLaunched = () => {
  isLanded = false;
  spaceportUI.close();
  if (soundEffectsEngine) {
    soundEffectsEngine.playUndock();
  }

  const targetPlanet = spaceportUI.planet;
  if (targetPlanet) {
    player.position = targetPlanet.position.add(
      new Vector2D(0, targetPlanet.landingRadius + 30),
    );
  }
  player.velocity = new Vector2D(0, 0);
  player.clearControls();
  uiController.notify(
    "Launch sequence completed! Thrusters online.",
    "success",
  );
};

network.onWarpSuccess = (msg) => {
  // Lock steering inputs / set isWarping = true on renderer
  renderer.isWarping = true;
  renderer.warpTimer = 0;
  renderer.warpTunnelStars = [];
  interpolator.clear();

  // Disable user input and autopilot
  player.clearControls();
  autopilotActive = false;
  soundEffectsEngine.playWarpJump();

  // Display visual transition notification
  uiController.notify(
    `Entering Hyperlane Warp Drive to ${msg.targetSector.toUpperCase()} Sector!`,
    "success",
  );

  // After 2.0 seconds of stunning warp star effects, set coordinates and restore controls
  setTimeout(() => {
    renderer.isWarping = false;
    player.position = new Vector2D(msg.position.x, msg.position.y);
    player.velocity = new Vector2D(0, 0);
    player.hyperFuel = msg.hyperFuel;
    uiController.notify(
      "Warp drive disengaged. Sector transition complete.",
      "info",
    );

    // Advance navigation route after successful warp jump
    advanceNavRouteAfterWarp();
  }, 2000);
};

network.onFleetSync = (msg) => {
  const setupEl = document.getElementById("fleet-setup");
  const rosterEl = document.getElementById("fleet-roster");
  const nameEl = document.getElementById("fleet-active-name");
  const listEl = document.getElementById("fleet-members-list");

  if (msg.name) {
    if (setupEl) setupEl.style.display = "none";
    if (rosterEl) rosterEl.style.display = "block";
    if (nameEl) nameEl.innerText = `FLEET: ${msg.name}`;

    if (listEl) {
      listEl.innerHTML = "";
      for (const member of msg.members) {
        const memberCard = document.createElement("div");
        memberCard.className = "fleet-member-card";

        const isSelf = member.id === network.playerId;
        const memberColor = isSelf ? "#00ff88" : "#c080ff";
        const shieldRatio = Math.max(
          0,
          Math.min(100, (member.shield / member.maxShield) * 100),
        );
        const armorRatio = Math.max(
          0,
          Math.min(100, (member.armor / member.maxArmor) * 100),
        );

        memberCard.innerHTML = `
          <div class="fleet-member-header">
            <span class="fleet-member-name" style="color: ${memberColor};">${member.nickname}</span>
            <span class="fleet-member-status">${member.isLanded ? `Landed: ${member.landedOn || "Port"}` : "Orbiting"}</span>
          </div>
          <div class="fleet-bars-container">
            <div class="fleet-bar-row">
              <span class="fleet-bar-label">SHIELD</span>
              <div class="fleet-mini-bar">
                <div class="fleet-mini-bar-fill" style="width: ${shieldRatio}%; background: #00ff88;"></div>
              </div>
            </div>
            <div class="fleet-bar-row">
              <span class="fleet-bar-label">ARMOR</span>
              <div class="fleet-mini-bar">
                <div class="fleet-mini-bar-fill" style="width: ${armorRatio}%; background: #ff3b30;"></div>
              </div>
            </div>
          </div>
        `;
        listEl.appendChild(memberCard);
      }
    }
  } else {
    if (setupEl) setupEl.style.display = "block";
    if (rosterEl) rosterEl.style.display = "none";
  }
  spaceportUI.refreshActiveTab();
};

network.onProjectileFired = (msg) => {
  const shooter = engine.entities.find((e) => e.id === msg.ownerId);
  if (shooter) {
    const dir = new Vector2D(Math.cos(msg.heading), Math.sin(msg.heading));
    const muzzleX = msg.x + dir.x * (shooter.radius + 2);
    const muzzleY = msg.y + dir.y * (shooter.radius + 2);
    renderer.spawnExplosion(muzzleX, muzzleY, "#00ffcc");
  }
};

network.onNotification = (msg) => {
  uiController.notify(msg.message, msg.style || "info");
};

network.onTutorialState = (msg) => {
  if (window.tutorialManager) {
    window.tutorialManager.handleServerState(msg);
  }
};

network.onCargoPickup = (msg) => {
  let color = "#ffffff";
  switch (msg.resourceType) {
    case "luxuries":
      color = "#ffd700";
      break;
    case "minerals":
      color = "#cd7f32";
      break;
    case "food":
      color = "#39ff14";
      break;
    case "electronics":
      color = "#00f0ff";
      break;
    case "contraband":
      color = "#d03ffc";
      break;
    case "machinery":
      color = "#b0b0b0";
      break;
  }
  renderer.addPickupText(
    `+${msg.amount} ${msg.resourceType.toUpperCase()}`,
    msg.x,
    msg.y,
    color,
  );
  if (soundEffectsEngine) {
    soundEffectsEngine.playCargoPickup({ x: msg.x, y: msg.y });
  }
};

network.onPingReceived = (pingMs) => {
  const elPing = document.getElementById("net-ping");
  const elQualityFill = document.getElementById("net-quality-fill");

  if (elPing) {
    elPing.innerText = `${pingMs} ms`;
    // Color-code the ping text
    if (pingMs < 80) {
      elPing.style.color = "var(--color-green)";
    } else if (pingMs < 200) {
      elPing.style.color = "#ffcc00";
    } else {
      elPing.style.color = "#ff3b30";
    }
  }

  if (elQualityFill) {
    // Map latency to bar width (100% at 0ms, 10% at 500ms+)
    const quality = Math.max(10, 100 - pingMs / 5);
    elQualityFill.style.width = `${quality}%`;
    if (pingMs < 80) {
      elQualityFill.style.background = "var(--color-green)";
    } else if (pingMs < 200) {
      elQualityFill.style.background = "#ffcc00";
    } else {
      elQualityFill.style.background = "#ff3b30";
    }
  }
};

// Roster updates are handled inside the unified onLobbySync handler

network.onConnectionStatusChange = (status) => {
  const elIndicator = document.getElementById("net-indicator");
  const elText = document.getElementById("net-status-text");

  if (!elIndicator || !elText) return;

  elIndicator.className = "net-dot";
  if (status === "online") {
    elIndicator.classList.add("pulse-green");
    elText.innerText = "CONN: ONLINE";
    elText.style.color = "var(--color-green)";
  } else if (status === "reconnecting") {
    elIndicator.classList.add("pulse-yellow");
    elText.innerText = "RECONNECTING...";
    elText.style.color = "#ffcc00";
  } else {
    elIndicator.classList.add("pulse-red");
    elText.innerText = "CONN: OFFLINE";
    elText.style.color = "#ff3b30";
  }
};

// Bind Fleet HUD Control elements
const btnFleetJoin = document.getElementById("btn-fleet-join");
const btnFleetLeave = document.getElementById("btn-fleet-leave");
const inputFleetNick = document.getElementById("fleet-nick-input");
const inputFleetCode = document.getElementById("fleet-code-input");

if (inputFleetNick) {
  inputFleetNick.value = localStorage.getItem("nebula_callsign") || "Commander";
}

btnFleetJoin?.addEventListener("click", () => {
  const nick = inputFleetNick ? inputFleetNick.value.trim() : "Commander";
  const code = inputFleetCode ? inputFleetCode.value.toUpperCase().trim() : "";

  if (!code) {
    uiController.notify("Please enter a Fleet Code!", "error");
    return;
  }

  network.requestFleetJoin(nick, code);
});

btnFleetLeave?.addEventListener("click", () => {
  network.requestFleetLeave();
});

// Chat message sync and element updates
network.onChatReceived = (msg) => {
  const logChat = document.getElementById("chat-log");
  if (!logChat) return;

  const msgDiv = document.createElement("div");
  if (msg.channel === "fleet") {
    msgDiv.className = "chat-msg fleet-msg";
    msgDiv.innerHTML = `<span class="chat-sender">[FLEET] ${escapeHTML(msg.sender)}:</span> ${escapeHTML(msg.text)}`;
  } else if (msg.channel === "squad") {
    msgDiv.className = "chat-msg squad-msg";
    msgDiv.innerHTML = `<span class="chat-sender">[SQUAD] ${escapeHTML(msg.sender)}:</span> ${escapeHTML(msg.text)}`;
  } else {
    msgDiv.className = "chat-msg global-msg";
    msgDiv.innerHTML = `<span class="chat-sender">[GLOBAL] ${escapeHTML(msg.sender)}:</span> ${escapeHTML(msg.text)}`;
  }

  logChat.appendChild(msgDiv);
  logChat.scrollTop = logChat.scrollHeight;
};

// Handle live economic market shifts from server
network.onMarketSync = (msg) => {
  const targetPlanet = planets.find((p) => p.name === msg.planetName);
  if (targetPlanet) {
    targetPlanet.market = msg.market;
    if (
      isLanded &&
      spaceportUI.planet &&
      spaceportUI.planet.name === targetPlanet.name
    ) {
      spaceportUI.refreshActiveTab();
    }
  }
};

network.onMarketBulkSync = (msg) => {
  if (msg.markets) {
    for (const [pName, market] of Object.entries(msg.markets)) {
      const targetPlanet = planets.find((p) => p.name === pName);
      if (targetPlanet) {
        targetPlanet.market = market;
      }
    }
    if (isLanded && spaceportUI.planet) {
      spaceportUI.refreshActiveTab();
    }
  }
};

network.onEventSync = (msg) => {
  activeSectorEvent = msg.event;
};

network.onGalaxyEventAnnouncement = (msg) => {
  activeGalaxyEvent = msg.event;
  uiController.updateGalaxyEvent(msg.event);
  if (isLanded && spaceportUI.planet) {
    spaceportUI.refreshActiveTab();
  }
};

// Safe sanitization for comms messages
function escapeHTML(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Comms input bindings
const chatInput = document.getElementById("chat-input");
const chatChannel = document.getElementById("chat-channel-select");

if (chatInput) {
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const text = chatInput.value.trim();
      if (text) {
        network.sendChat(chatChannel ? chatChannel.value : "global", text);
      }
      chatInput.value = "";
      chatInput.blur();
    }
  });

  // Global keyhook: Enter toggles focus onto the Sector Comms text field
  window.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (document.activeElement !== chatInput) {
        // Only trigger focus if not currently typing in callsign input
        const activeTag = document.activeElement
          ? document.activeElement.tagName
          : "";
        const activeId = document.activeElement
          ? document.activeElement.id
          : "";
        if (
          activeTag !== "INPUT" &&
          activeId !== "fleet-nick-input" &&
          activeId !== "fleet-code-input"
        ) {
          e.preventDefault();
          chatInput.focus();
        }
      }
    }
  });
}

// Populate share URL bar for easy friend invites
const shareUrlText = document.getElementById("share-url-text");
const btnCopyServerUrl = document.getElementById("btn-copy-server-url");
if (shareUrlText) {
  // Strip query parameters to show the clean base URL
  shareUrlText.textContent = `${window.location.origin}${window.location.pathname}`;
}
if (btnCopyServerUrl) {
  btnCopyServerUrl.addEventListener("click", () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        btnCopyServerUrl.textContent = "COPIED ✅";
        setTimeout(() => {
          btnCopyServerUrl.textContent = "COPY LINK";
        }, 2000);
        uiController.notify(
          "Server invite link copied to clipboard!",
          "success",
        );
      })
      .catch(() => {
        uiController.notify(
          "Failed to copy. Select the URL manually.",
          "error",
        );
      });
  });
}

// Auto-connect to authoritative server
network.connect();

// Setup High-Precision GameLoop
let lastTime = 0;
function gameLoop(time) {
  if (!lastTime) {
    lastTime = time;
    requestAnimationFrame(gameLoop);
    return;
  }

  // Calculate elapsed frame step in seconds
  let dt = (time - lastTime) / 1000;
  lastTime = time;

  if (player && player.position) {
    soundEffectsEngine.setListenerPosition(
      player.position.x,
      player.position.y,
    );
  }

  // Prune stale entities from interpolator
  interpolator.prune(Date.now() - 5000);

  // Cap delta time to prevent massive position skipping on browser tab sleeps
  if (dt > 0.1) dt = 0.1;

  if (window.tutorialManager) {
    window.tutorialManager.update(dt);
  }

  if (activeGalaxyEvent) {
    activeGalaxyEvent.duration -= dt;
    if (activeGalaxyEvent.duration <= 0) {
      activeGalaxyEvent = null;
      uiController.updateGalaxyEvent(null);
      if (isLanded && spaceportUI.planet) {
        spaceportUI.refreshActiveTab();
      }
    } else {
      uiController.updateGalaxyEvent(activeGalaxyEvent);
    }
  }

  if (!isLanded) {
    // A. Handle active Solar EMP Flare effects
    if (network) {
      if (
        network.connected &&
        activeSectorEvent &&
        activeSectorEvent.type === "emp"
      ) {
        const empPlanet = planets.find(
          (p) => p.name === activeSectorEvent.planetName,
        );
        if (empPlanet && player.position.distance(empPlanet.position) <= 400) {
          player.shieldRegen = 0;
        } else {
          player.shieldRegen = 10;
        }
      } else {
        player.shieldRegen = 10;
      }
    } else {
      // Offline mode only
      if (empTimer > 0) {
        empTimer -= dt;
        player.shieldRegen = 0;
        player.thrustPower = 9000; // nerf thrust power
        if (empTimer <= 0) {
          player.shieldRegen = 10;
          player.thrustPower = 28000; // restore original thrust power
          uiController.notify(
            "Solar EMP Storm subsided. All ship systems restored.",
            "success",
          );
        }
      }
    }

    // B. Increment and trigger random flight space events periodically (offline only)
    if (!network) {
      eventCheckTimer += dt;
      if (eventCheckTimer >= 40) {
        eventCheckTimer = 0;
        triggerRandomSpaceEvent();
      }
    }

    // 1. Map player steering keys directly to ship propulsion accumulator
    if (renderer.isWarping) {
      player.clearControls();
    } else if (autopilotActive && navRoute.length > 0) {
      // AUTOPILOT STEERING TICK
      const targetGate = getNextWarpGate(engine.entities);
      if (targetGate) {
        const dx = targetGate.position.x - player.position.x;
        const dy = targetGate.position.y - player.position.y;
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - player.heading;
        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        const dist = Math.sqrt(dx * dx + dy * dy);

        // Steer towards target
        const turnThreshold = 0.08;
        const isAligned = Math.abs(angleDiff) < turnThreshold;

        player.setControls({
          isTurningLeft: angleDiff < -turnThreshold,
          isTurningRight: angleDiff > turnThreshold,
          isThrusting: isAligned || Math.abs(angleDiff) < 0.4,
          isBraking: false,
          isFiring: false,
        });

        // Auto-warp when in gate proximity and roughly aligned
        if (dist <= 150 && Math.abs(angleDiff) < 0.5) {
          autopilotActive = false;
          updateNavigationHUD();
          // Fire the warp jump
          if (window.network && window.network.connected) {
            window.network.send({ type: "warp_jump", gateId: targetGate.id });
          }
        }
      } else {
        // No gate found for route — disengage autopilot
        autopilotActive = false;
        updateNavigationHUD();
        uiController.notify(
          "Autopilot error: No stargate found for this route.",
          "error",
        );
      }

      // Disengage autopilot if manual steering keys are physically pressed
      if (
        inputHandler.keys["KeyA"] ||
        inputHandler.keys["KeyD"] ||
        inputHandler.keys["KeyS"]
      ) {
        autopilotActive = false;
        updateNavigationHUD();
        uiController.notify(
          "Manual override detected. Autopilot disengaged.",
          "info",
        );
        inputHandler.applyInputToShip(player);
      }
    } else {
      inputHandler.applyInputToShip(player);
    }

    // Send input controls to the server if in multiplayer
    if (network && network.connected) {
      network.sendControls(player.controls, player.heading);
    }

    // 2. Drive AI merchant itineraries dynamically between planetary hubs (offline only)
    if (!network) {
      for (const ai of ais) {
        if (ai.role === "merchant" && !ai.destination) {
          const potentialHubs = planets.filter(
            (p) => p.position.distance(ai.ship.position) > 250,
          );
          if (potentialHubs.length > 0) {
            const nextHub =
              potentialHubs[Math.floor(Math.random() * potentialHubs.length)];
            ai.destination = nextHub.position.clone();
          }
        }
        ai.update(dt, engine.entities);
      }
    }

    // 3. Advance Newtonian kinematics, elastic rebounds, and laser damage
    const originalRegens = new Map();
    if (activeSectorEvent && activeSectorEvent.type === "emp") {
      const empPlanet = planets.find(
        (p) => p.name === activeSectorEvent.planetName,
      );
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

    // Apply Nebula Hazards locally for flawless motion prediction
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
          if (engine.globalDrag > 0 && ent.velocity.magnitude() > 0) {
            const extraDragCoef = activeNebula.dragMultiplier - 1.0;
            const extraDragForce = ent.velocity.multiply(
              -extraDragCoef * engine.globalDrag * ent.mass,
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

    engine.update(dt);

    for (const [ship, origRegen] of originalRegens.entries()) {
      ship.shieldRegen = origRegen;
    }
  }

  // 4. Update navigation arrow target for rendering
  if (navTargetSector && navRoute.length > 0) {
    renderer.navigationTarget = getNextWarpGate(engine.entities);
  } else {
    renderer.navigationTarget = null;
  }

  // 5. Render stellar parallax, engine trails, ship vectors, target corner brackets, HUD pointer arrows
  const originalStates = new Map();
  const nowMs = Date.now();
  const localId = (network && network.playerId) || "player";

  for (const ent of engine.entities) {
    if (ent.id === localId || ent.type === "planet") continue;

    const interp = interpolator.getInterpolated(ent.id, nowMs);
    if (interp) {
      originalStates.set(ent.id, {
        x: ent.position.x,
        y: ent.position.y,
        heading: ent.heading,
      });
      ent.position.x = interp.x;
      ent.position.y = interp.y;
      ent.heading = interp.heading;
    }
  }

  renderer.draw(
    dt,
    player,
    engine.entities,
    playerTarget,
    network ? network.playerId : null,
    network && network.fleet ? network.fleet.members : [],
    network && network.fleet ? network.fleet.name : null,
    activeSectorEvent,
  );

  // Restore original coordinates/headings so that local client-side physics, target locked distances, and interactions use authentic values
  for (const [id, orig] of originalStates.entries()) {
    const ent = engine.entities.find((e) => e.id === id);
    if (ent) {
      ent.position.x = orig.x;
      ent.position.y = orig.y;
      ent.heading = orig.heading;
    }
  }

  // 5. Synchronize dynamic health bars and targeting dials with overlay DOM dashboard
  uiController.update(
    player,
    playerTarget,
    planets,
    NEBULAE,
    engine.entities,
    missionManager ? missionManager.activeMissions : [],
    navTargetSector,
    navRoute,
  );

  requestAnimationFrame(gameLoop);
}

// ==========================================
// TACTICAL BOARDING & ESCORT COMMAND SYSTEMS
// ==========================================

const boardingPanel = document.getElementById("boarding-panel");
const boardingShipInfo = document.getElementById("boarding-ship-info");

inputHandler.onBoardPressed = () => {
  if (!playerTarget || playerTarget.isDestroyed || !playerTarget.isDisabled) {
    uiController.notify(
      "Boarding unavailable: scanners must lock a disabled ship.",
      "error",
    );
    return;
  }

  const dist = player.position.distance(playerTarget.position);
  if (dist > 250) {
    uiController.notify(
      "Target too distant! Move within 250u proximity.",
      "error",
    );
    return;
  }

  if (boardingPanel) {
    if (boardingPanel.style.display === "none") {
      boardingPanel.style.display = "block";
      if (boardingShipInfo) {
        boardingShipInfo.innerText = `TARGET: ${playerTarget.name.toUpperCase()} (DISABLED HULL)`;
      }
      uiController.notify(
        "Boarding tethers locked. Ready to infiltrate ship reactor cores.",
        "success",
      );
    } else {
      boardingPanel.style.display = "none";
    }
  }
};

document.getElementById("btn-board-exit")?.addEventListener("click", () => {
  if (boardingPanel) boardingPanel.style.display = "none";
});

function sendBoardingAction(action) {
  if (!playerTarget) return;
  if (network && network.connected) {
    network.send({
      type: "boarding_action",
      targetId: playerTarget.id,
      action: action,
    });
  } else {
    uiController.notify(
      "Neural link offline! Cannot transmit boarding commands.",
      "error",
    );
  }
  if (boardingPanel) boardingPanel.style.display = "none";
}

document
  .getElementById("btn-board-plunder")
  ?.addEventListener("click", () => sendBoardingAction("plunder"));
document
  .getElementById("btn-board-salvage")
  ?.addEventListener("click", () => sendBoardingAction("salvage"));
document
  .getElementById("btn-board-capture")
  ?.addEventListener("click", () => sendBoardingAction("capture"));
document
  .getElementById("btn-board-scuttle")
  ?.addEventListener("click", () => sendBoardingAction("scuttle"));

// Escort Wingman Command Hotkeys Listener (H, F, G)
window.addEventListener("keydown", (e) => {
  // Disable game commands if typing in input panels
  if (
    document.activeElement &&
    (document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA")
  ) {
    return;
  }

  if (e.code === "KeyH") {
    // Hold command
    if (network && network.connected) {
      network.send({ type: "escort_command", command: "hold" });
    }
  } else if (e.code === "KeyF") {
    // Follow / Defend command
    if (network && network.connected) {
      network.send({ type: "escort_command", command: "follow" });
    }
  } else if (e.code === "KeyG") {
    // Attack targeted ship command
    if (network && network.connected) {
      network.send({ type: "escort_command", command: "attack" });
    }
  } else if (e.code === "F2") {
    // Delta wing formation
    e.preventDefault();
    if (network && network.connected) {
      network.send({ type: "escort_formation", formation: "delta" });
    }
  } else if (e.code === "F3") {
    // Defensive orbit formation
    e.preventDefault();
    if (network && network.connected) {
      network.send({ type: "escort_formation", formation: "orbit" });
    }
  }
});

// ==========================================================================
// ENDLESS SKY GALACTIC NAVIGATION SYSTEM & MAP ENGINE
// ==========================================================================

const MAP_SECTORS = {
  core: {
    name: "Core Sector",
    x: 25,
    y: 50,
    description: "Sol System and Core Fleet staging area. Cradle of humanity.",
    planets: ["Sol", "Valkyrie Depot"],
  },
  frontier: {
    name: "Frontier Sector",
    x: 50,
    y: 30,
    description:
      "Nebulae asteroid mines and advanced technology research systems.",
    planets: ["New Polaris", "Sigma Draconis", "Aurelia Mining Hub"],
  },
  rim: {
    name: "Outer Rim Sector",
    x: 75,
    y: 70,
    description:
      "Agricultural worlds, agricultural logistics, and pirate holds.",
    planets: ["Kaelis Colony", "Tenebris Prime", "Rogue's Hollow"],
  },
};

const MAP_CONNECTIONS = [
  ["core", "frontier"],
  ["frontier", "rim"],
];

function renderGalaxyMap() {
  const svg = document.getElementById("galaxy-map-svg");
  const nodesContainer = document.getElementById("galaxy-map-nodes");
  const infoBar = document.getElementById("galaxy-map-info");
  if (!svg || !nodesContainer) return;

  svg.innerHTML = "";
  nodesContainer.innerHTML = "";

  const rect = svg.getBoundingClientRect();
  const width = rect.width || 700;
  const height = rect.height || 450;

  const currentSector = getSectorFromPosition(player.position);

  // 1. Render connected hyperlanes (SVG paths)
  MAP_CONNECTIONS.forEach(([from, to]) => {
    const fromSector = MAP_SECTORS[from];
    const toSector = MAP_SECTORS[to];

    const x1 = (fromSector.x / 100) * width;
    const y1 = (fromSector.y / 100) * height;
    const x2 = (toSector.x / 100) * width;
    const y2 = (toSector.y / 100) * height;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);

    let isActive = false;
    if (navRoute.length > 0) {
      const fullPath = [currentSector, ...navRoute];
      for (let i = 0; i < fullPath.length - 1; i++) {
        if (
          (fullPath[i] === from && fullPath[i + 1] === to) ||
          (fullPath[i] === to && fullPath[i + 1] === from)
        ) {
          isActive = true;
          break;
        }
      }
    }

    line.setAttribute(
      "class",
      isActive ? "map-link map-link-active" : "map-link",
    );
    svg.appendChild(line);
  });

  // 2. Render HTML nodes representing systems
  Object.entries(MAP_SECTORS).forEach(([id, sector]) => {
    const node = document.createElement("div");
    node.className = "map-node";
    node.style.left = `${sector.x}%`;
    node.style.top = `${sector.y}%`;

    if (currentSector === id) {
      node.classList.add("active-system");
    } else if (navTargetSector === id) {
      node.classList.add("targeted-system");
    } else if (navRoute.includes(id)) {
      node.classList.add("route-step");
    }

    node.innerHTML = `
      <span class="map-node-label">${sector.name}</span>
      <span class="map-node-subtitle">${sector.planets.length} Planets</span>
    `;

    node.addEventListener("click", (e) => {
      e.stopPropagation();

      if (currentSector === id) {
        navTargetSector = null;
        navRoute = [];
        autopilotActive = false;
        uiController.notify("Navigation coordinates cleared.", "info");
      } else {
        navTargetSector = id;
        navRoute = calculateShortestPath(currentSector, id);
        uiController.notify(
          `Course plotted to ${sector.name}! ${navRoute.length} sector jump${navRoute.length > 1 ? "s" : ""} required.`,
          "success",
        );
      }

      updateNavigationHUD();
      renderGalaxyMap();
    });

    node.addEventListener("mouseover", () => {
      if (infoBar)
        infoBar.innerText = `${sector.name.toUpperCase()}: ${sector.description}`;
    });

    node.addEventListener("mouseout", () => {
      if (infoBar) {
        infoBar.innerText = navTargetSector
          ? `PLOTTED ROUTE: ${currentSector.toUpperCase()} ➜ ${navRoute.map((s) => s.toUpperCase()).join(" ➜ ")} (${navRoute.length} JUMPS)`
          : "SELECT A DESTINATION SYSTEM";
      }
    });

    nodesContainer.appendChild(node);
  });
}

function updateNavigationHUD() {
  const hudNav = document.getElementById("hud-navigation");
  const navTargetName = document.getElementById("nav-target-name");
  const navRouteSteps = document.getElementById("nav-route-steps");
  const autopilotInd = document.getElementById("autopilot-indicator");

  if (!hudNav) return;

  if (navTargetSector) {
    hudNav.style.display = "block";
    if (navTargetName)
      navTargetName.innerText = MAP_SECTORS[navTargetSector].name.toUpperCase();

    if (navRouteSteps) {
      const currentSector = getSectorFromPosition(player.position);
      const steps = [currentSector, ...navRoute].map((s) => s.toUpperCase());
      navRouteSteps.innerHTML = `
        <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px; overflow-x: auto; white-space: nowrap; padding-bottom: 2px;">
          ${steps
            .map(
              (step, idx) => `
            <span style="color: ${idx === 0 ? "var(--color-green)" : idx === steps.length - 1 ? "var(--color-gold)" : "var(--color-cyan)"}; font-weight: bold; font-size: 8px;">
              ${step}
            </span>
            ${idx < steps.length - 1 ? '<span style="color: rgba(255,255,255,0.3); font-size: 8px;">➜</span>' : ""}
          `,
            )
            .join("")}
        </div>
        <div style="font-size: 7px; color: #a0a5b5; margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
          <span>DISTANCE: ${navRoute.length} Jump${navRoute.length > 1 ? "s" : ""}</span>
          <span style="color: var(--color-cyan); font-weight: bold; cursor: pointer;" id="btn-nav-clear-text">[CLEAR NAV]</span>
        </div>
      `;

      document
        .getElementById("btn-nav-clear-text")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          navTargetSector = null;
          navRoute = [];
          autopilotActive = false;
          updateNavigationHUD();
          renderGalaxyMap();
          uiController.notify("Navigation target cleared.", "info");
        });
    }
  } else {
    hudNav.style.display = "none";
  }

  if (autopilotInd) {
    autopilotInd.style.display = autopilotActive ? "block" : "none";
  }
}

function toggleGalaxyMap() {
  const overlay = document.getElementById("galaxy-map-overlay");
  if (!overlay) return;

  const isVisible = overlay.classList.contains("visible");
  if (isVisible) {
    overlay.classList.remove("visible");
  } else {
    if (isLanded) {
      uiController.notify(
        "Cannot open galactic nav charts while docked!",
        "error",
      );
      return;
    }
    overlay.classList.add("visible");
    renderGalaxyMap();
  }
}

// Bind Map triggers
inputHandler.onMapPressed = toggleGalaxyMap;

document.getElementById("btn-hud-map")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleGalaxyMap();
});

document.getElementById("btn-close-map")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleGalaxyMap();
});

// Re-render map on window resize so SVG lines line up
window.addEventListener("resize", () => {
  const overlay = document.getElementById("galaxy-map-overlay");
  if (overlay && overlay.classList.contains("visible")) {
    renderGalaxyMap();
  }
});

// Bind Audio Toggle
const audioToggleBtn = document.getElementById("btn-audio-toggle");
if (audioToggleBtn) {
  if (initialMuted) {
    audioToggleBtn.classList.add("muted");
    audioToggleBtn.innerText = "AUDIO: OFF";
  } else {
    audioToggleBtn.classList.remove("muted");
    audioToggleBtn.innerText = "AUDIO: ON";
  }

  audioToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    soundEffectsEngine.start();

    if (soundEffectsEngine.muted) {
      soundEffectsEngine.unmute();
      localStorage.setItem("audio_muted", "false");
      audioToggleBtn.classList.remove("muted");
      audioToggleBtn.innerText = "AUDIO: ON";
    } else {
      soundEffectsEngine.mute();
      localStorage.setItem("audio_muted", "true");
      audioToggleBtn.classList.add("muted");
      audioToggleBtn.innerText = "AUDIO: OFF";
    }
  });
}
