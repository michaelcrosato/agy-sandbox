/**
 * Manages keyboard controls, mapping events directly into Player Ship controls.
 */
export class InputHandler {
  constructor() {
    // Current key press map
    this.keys = {};

    // Single-trigger listeners (pulsed actions)
    this.onLandPressed = null;
    this.onTargetPressed = null;
    this.onHostilePressed = null;

    this.setupListeners();
  }

  /**
   * Registers global event listeners on the window object.
   */
  setupListeners() {
    window.addEventListener("keydown", (e) => {
      // Ignore key events if the user is typing in a text input field
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }

      // Prevent standard browser scrolling behavior for gaming keys
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }

      this.keys[e.code] = true;

      // Capture single-fire action trigger pulses
      if (e.code === "KeyL" && this.onLandPressed) {
        this.onLandPressed();
      }
      if (e.code === "KeyT" && this.onTargetPressed) {
        this.onTargetPressed();
      }
      if (e.code === "KeyR" && this.onHostilePressed) {
        this.onHostilePressed();
      }
    });

    window.addEventListener("keyup", (e) => {
      // Ignore key events if typing
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }
      this.keys[e.code] = false;
    });

    // Reset controls if the tab loses focus
    window.addEventListener("blur", () => {
      this.keys = {};
    });
  }

  /**
   * Reads keys state map and overrides the player ship control state flags.
   * @param {Ship} playerShip - The ship controlled by the player.
   */
  applyInputToShip(playerShip) {
    if (!playerShip || playerShip.isDestroyed) return;

    // Suppress movement controls while typing in input elements
    if (
      document.activeElement &&
      (document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA")
    ) {
      playerShip.setControls({
        isThrusting: false,
        isBraking: false,
        isTurningLeft: false,
        isTurningRight: false,
        isFiring: false,
      });
      return;
    }

    playerShip.setControls({
      isThrusting: !!(this.keys["ArrowUp"] || this.keys["KeyW"]),
      isBraking: !!(this.keys["ArrowDown"] || this.keys["KeyS"]),
      isTurningLeft: !!(this.keys["ArrowLeft"] || this.keys["KeyA"]),
      isTurningRight: !!(this.keys["ArrowRight"] || this.keys["KeyD"]),
      isFiring: !!this.keys["Space"],
    });
  }
}
