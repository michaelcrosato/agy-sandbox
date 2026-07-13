import { expect, test } from "vitest";
import { InputHandler } from "../InputHandler.js";
import { Ship } from "../../engine/Ship.js";

test("InputHandler maps key events to player control flags correctly", () => {
  const handler = new InputHandler();
  const ship = new Ship();

  // 1. Verify default controls
  handler.applyInputToShip(ship);
  expect(ship.controls.isThrusting).toBe(false);
  expect(ship.controls.isBraking).toBe(false);

  // 2. Press ArrowUp
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
  handler.applyInputToShip(ship);
  expect(ship.controls.isThrusting).toBe(true);

  // 3. Release ArrowUp
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowUp" }));
  handler.applyInputToShip(ship);
  expect(ship.controls.isThrusting).toBe(false);

  // 4. Press KeyS (Braking) and KeyA (Turning Left)
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA" }));
  handler.applyInputToShip(ship);
  expect(ship.controls.isBraking).toBe(true);
  expect(ship.controls.isTurningLeft).toBe(true);
  expect(ship.controls.isTurningRight).toBe(false);

  // 5. Single-pulse actions callback
  let landPressed = false;
  handler.onLandPressed = () => {
    landPressed = true;
  };
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL" }));
  expect(landPressed).toBe(true);

  // 6. Test window blur resets keys
  window.dispatchEvent(new Event("blur"));
  handler.applyInputToShip(ship);
  expect(ship.controls.isBraking).toBe(false);
  expect(ship.controls.isTurningLeft).toBe(false);
});
