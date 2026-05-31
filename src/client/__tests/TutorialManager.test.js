import { describe, test, expect, beforeEach } from "vitest";
import { TutorialManager } from "../TutorialManager.js";
import { Ship } from "../../engine/Ship.js";
import { UIController } from "../UIController.js";
import { InputHandler } from "../InputHandler.js";
describe("Interactive Cockpit Onboarding Tutorial HUD Guide (SPEC-105/SPEC-158)", () => {
  let player;
  let uiController;
  let inputHandler;
  let spaceportUI;
  let renderer;
  let network;
  let tutorialManager;

  beforeEach(() => {
    // 1. Setup Mock DOM environment
    document.body.innerHTML = `
      <div id="game-viewport">
        <div id="stat-speed"></div>
        <div id="stat-coords"></div>
        <div id="stat-credits"></div>
        <div id="stat-cargo"></div>
        <div id="target-scanner" class="glass-panel"></div>
        <div id="landing-prompt"></div>
        <div id="warp-prompt"></div>
        <div id="notification-log"></div>
        <div id="hud-missions-list"></div>
        <div id="spaceport-overlay" class="glass-overlay hidden">
          <div id="tab-trade" class="hidden">
            <button class="btn-trade-buy" data-item="ore">BUY</button>
            <button class="btn-trade-sell" data-item="ore">SELL</button>
          </div>
        </div>
      </div>
    `;

    // 2. Initialize dependencies
    player = new Ship({
      id: "player",
      credits: 1000,
      cargoCapacity: 10,
    });

    uiController = new UIController();
    inputHandler = new InputHandler();

    // Mock SpaceportUI
    spaceportUI = {
      open: () => {},
      close: () => {},
      renderTrade: () => {},
    };

    // Mock CanvasRenderer
    renderer = {
      navigationTarget: null,
      entities: [],
    };

    // Mock NetworkHandler
    network = {
      connected: true,
      tutorialCompleted: false,
      send: () => {},
    };

    // 3. Construct TutorialManager
    tutorialManager = new TutorialManager({
      player,
      uiController,
      inputHandler,
      spaceportUI,
      renderer,
      network,
    });
  });

  test("initializes correctly with standard properties", () => {
    expect(tutorialManager.isActive).toBe(false);
    expect(tutorialManager.currentStep).toBe("thrust_maneuver");
    expect(tutorialManager.rotationTracked).toBe(false);
    expect(tutorialManager.thrustTracked).toBe(false);
  });

  test("opt-in checkOnboarding prompts first-time pilot correctly", () => {
    localStorage.removeItem("nebula_tutorial_completed");
    tutorialManager.checkOnboarding();

    const promptCard = document.getElementById("tutorial-prompt-card");
    expect(promptCard).not.toBeNull();

    // Launch tutorial clicks start
    promptCard.querySelector("#btn-tutorial-start").click();
    expect(tutorialManager.isActive).toBe(true);
    expect(document.getElementById("tutorial-prompt-card")).toBeNull();
    expect(document.getElementById("tutorial-step-card")).not.toBeNull();
  });

  test("opt-out bypass persists complete status cleanly", () => {
    localStorage.removeItem("nebula_tutorial_completed");
    let msgSent = null;
    network.send = (msg) => {
      msgSent = msg;
    };

    tutorialManager.checkOnboarding();
    const promptCard = document.getElementById("tutorial-prompt-card");
    promptCard.querySelector("#btn-tutorial-skip").click();

    expect(tutorialManager.isActive).toBe(false);
    expect(localStorage.getItem("nebula_tutorial_completed")).toBe("true");
    expect(msgSent).toEqual({ type: "tutorial_complete" });
  });

  test("Step 1: Tracks movement mastery and advances step", () => {
    tutorialManager.start();
    expect(tutorialManager.currentStep).toBe("thrust_maneuver");

    // Mock keypress for steering
    inputHandler.keys["KeyA"] = true;
    tutorialManager.update(0.1);
    expect(tutorialManager.rotationTracked).toBe(true);
    expect(tutorialManager.thrustTracked).toBe(false);

    // Mock keypress for thrusting
    inputHandler.keys["KeyW"] = true;
    tutorialManager.update(0.1);
    expect(tutorialManager.thrustTracked).toBe(true);

    // Advance step
    tutorialManager.advanceStepDelay("lock_target");
    expect(tutorialManager.currentStep).toBe("lock_target");
    expect(
      document
        .querySelector("#target-scanner")
        .classList.contains("hud-highlight-glow"),
    ).toBe(true);
  });

  test("Step 2-5: Synchronizes step transitions from server-authoritative messages", () => {
    tutorialManager.start();

    // Move to step 2 (lock_target)
    tutorialManager.handleServerState({ step: "lock_target" });
    expect(tutorialManager.currentStep).toBe("lock_target");

    // Move to step 3 (destroy_drone)
    tutorialManager.handleServerState({ step: "destroy_drone" });
    expect(tutorialManager.currentStep).toBe("destroy_drone");

    // Move to step 4 (collect_salvage)
    tutorialManager.handleServerState({ step: "collect_salvage" });
    expect(tutorialManager.currentStep).toBe("collect_salvage");

    // Move to step 5 (dock_at_port)
    tutorialManager.handleServerState({ step: "dock_at_port" });
    expect(tutorialManager.currentStep).toBe("dock_at_port");
    expect(
      document
        .querySelector("#landing-prompt")
        .classList.contains("hud-highlight-glow"),
    ).toBe(true);
  });

  test("Onboarding completion distributes rewards and syncs state to server", () => {
    let msgSent = null;
    network.send = (msg) => {
      msgSent = msg;
    };

    tutorialManager.start();
    tutorialManager.handleServerState({ step: "dock_at_port" });

    // Simulate onboarding completion
    tutorialManager.completeTutorial();

    expect(tutorialManager.isActive).toBe(false);
    expect(player.credits).toBe(1500); // 1000 + 500 starter bonus
    expect(localStorage.getItem("nebula_tutorial_completed")).toBe("true");
    expect(msgSent).toEqual({ type: "tutorial_complete" });
  });
});
