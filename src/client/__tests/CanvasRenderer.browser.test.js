import { expect, test, beforeAll, afterAll } from "vitest";
import { CanvasRenderer } from "../CanvasRenderer.js";
import { Vector2D } from "../../physics/Vector2D.js";
import { Ship } from "../../engine/Ship.js";
import { Planet } from "../../engine/Planet.js";

let originalRandom;

beforeAll(() => {
  originalRandom = Math.random;
  let seed = 42;
  // A simple LCG PRNG for exact rendering determinism
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
});

afterAll(() => {
  Math.random = originalRandom;
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
