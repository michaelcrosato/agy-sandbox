import { expect, test, beforeAll, beforeEach, afterAll } from "vitest";
import { CanvasRenderer } from "../CanvasRenderer.js";
import { Vector2D } from "../../physics/Vector2D.js";
import { Ship } from "../../engine/Ship.js";
import { Planet } from "../../engine/Planet.js";
import { Projectile } from "../../engine/Projectile.js";
import { CosmicStorm } from "../../engine/CosmicStorm.js";
import { CargoPod } from "../../engine/CargoPod.js";
import { SpaceEntity } from "../../engine/SpaceEntity.js";

let originalRandom;
let originalNow;
let currentSeed = 42;

beforeAll(() => {
  originalRandom = Math.random;
  // A simple LCG PRNG for exact rendering determinism
  Math.random = () => {
    currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
    return currentSeed / 4294967296;
  };

  originalNow = Date.now;
  // Mock Date.now() to a frozen timestamp so that pulsating HUD gradients,
  // target flashes, and lineDashOffset animations are fully stable.
  Date.now = () => 1700000000000;
});

beforeEach(() => {
  currentSeed = 42;
});

afterAll(() => {
  Math.random = originalRandom;
  Date.now = originalNow;
});

test("CanvasRenderer renders a deterministic space scene", async () => {
  const container = document.createElement("div");
  container.setAttribute("id", "canvas-container");
  container.style.width = "400px";
  container.style.height = "300px";
  container.style.position = "relative";
  container.style.background = "#000";

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  document.body.appendChild(container);

  const renderer = new CanvasRenderer(canvas);
  renderer.resize();

  // Create deterministic ship and planet models
  const player = new Ship({
    position: new Vector2D(0, 0),
    name: "Alpha-1",
    maxShield: 100,
    maxArmor: 100,
  });
  player.shield = 80;
  player.armor = 90;

  const planet = new Planet({
    position: new Vector2D(120, 100),
    radius: 35,
    name: "Aurelia",
    color: "#4f46e5",
  });

  const target = new Ship({
    position: new Vector2D(-100, -80),
    name: "Raider",
  });

  const entities = [player, planet, target];

  renderer.draw(
    0.1, // dt
    player, // playerShip
    entities, // entities
    target, // targetEntity
    "player-1", // localPlayerId
  );

  // Visual screenshot assertion
  await expect(container).toMatchScreenshot("space-scene-smoke");

  // Clean up
  document.body.removeChild(container);
});

test("CanvasRenderer renders a fully-populated composite space viewport with various game entities and effects", async () => {
  const container = document.createElement("div");
  container.setAttribute("id", "canvas-container-composite");
  container.style.width = "600px";
  container.style.height = "450px";
  container.style.position = "relative";
  container.style.background = "#000";

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  document.body.appendChild(container);

  const renderer = new CanvasRenderer(canvas);
  renderer.resize();

  // Create deterministic ship models
  const player = new Ship({
    position: new Vector2D(0, 0),
    name: "Alpha-1",
    maxShield: 100,
    maxArmor: 100,
    heading: 0.5,
  });
  player.shield = 50; // half shield
  player.armor = 85;
  player.controls = {
    isThrusting: true,
    isBoosting: true,
  };
  player.energy = 80;

  // Add key outfits to showcase dynamic rendering overlays (radar, tractor)
  player.outfits = ["radar", "tractor"];

  const planet = new Planet({
    position: new Vector2D(250, 180),
    radius: 45,
    name: "New Polaris",
    color: "#e11d48",
  });

  const enemy = new Ship({
    position: new Vector2D(-120, -90),
    name: "Outlaw Boss",
    maxShield: 200,
    maxArmor: 200,
    heading: Math.PI,
  });
  enemy.shield = 10;
  enemy.armor = 140;

  const proj = new Projectile({
    ownerId: "Alpha-1",
    startPosition: new Vector2D(20, 10),
    heading: 0.5,
    speed: 600,
  });

  const storm = new CosmicStorm({
    id: "storm-1",
    name: "Stellar EMP Cloud",
    position: new Vector2D(-50, 80),
    radius: 120,
    hazardType: "emp_storm",
  });

  const pod = new CargoPod({
    resourceType: "ore",
    amount: 10,
    position: new Vector2D(80, -60),
  });

  const gate = new SpaceEntity({
    id: "warp-gate-1",
    type: "warp_gate",
    position: new Vector2D(-200, 150),
    radius: 35,
  });
  gate.name = "Stargate Sol";

  const asteroid = new SpaceEntity({
    id: "asteroid-1",
    type: "generic",
    position: new Vector2D(180, -120),
    radius: 20,
  });

  const entities = [player, planet, enemy, proj, storm, pod, gate, asteroid];

  renderer.draw(
    0.05, // dt
    player, // playerShip
    entities, // entities
    enemy, // targetEntity
    "Alpha-1", // localPlayerId
  );

  // Visual screenshot assertion with tolerant matching
  await expect(container).toMatchScreenshot("space-scene-composite-rich", {
    maxDiffPixelRatio: 0.05,
  });

  // Clean up
  document.body.removeChild(container);
});

test("CanvasRenderer renders custom engine exhaust plumes successfully without errors", async () => {
  const container = document.createElement("div");
  container.style.width = "400px";
  container.style.height = "300px";
  container.style.background = "#000";

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);
  document.body.appendChild(container);

  const renderer = new CanvasRenderer(canvas);
  renderer.resize();

  const playerOvercharged = new Ship({
    position: new Vector2D(0, -30),
    name: "Overcharged Ship",
  });
  playerOvercharged.controls = { isThrusting: true, isBoosting: true };
  playerOvercharged.outfits = ["Overcharged Engines"];

  const playerHyperdrive = new Ship({
    position: new Vector2D(0, 30),
    name: "Hyperdrive Ship",
  });
  playerHyperdrive.controls = { isThrusting: true, isBoosting: true };
  playerHyperdrive.outfits = ["Hyper-Drive Thrusters"];

  const entities = [playerOvercharged, playerHyperdrive];

  expect(() => {
    renderer.draw(
      0.05,
      playerOvercharged,
      entities,
      null,
      playerOvercharged.id,
    );
  }).not.toThrow();

  document.body.removeChild(container);
});
