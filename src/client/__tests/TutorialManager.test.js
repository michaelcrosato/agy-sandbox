import { describe, test, expect, beforeEach } from "vitest";
import { TutorialManager } from "../TutorialManager.js";
import { Ship } from "../../engine/Ship.js";
import { UIController } from "../UIController.js";
import { InputHandler } from "../InputHandler.js";

import { Vector2D } from "../../physics/Vector2D.js";

describe("Interactive Cockpit Onboarding Tutorial HUD Guide (SPEC-105)", () => {
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
    expect(tutorialManager.currentStep).toBe(1);
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

  test("Step 1: Tracks movement mastery and auto-advances to Step 2", () => {
    tutorialManager.start();
    expect(tutorialManager.currentStep).toBe(1);

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
    tutorialManager.advanceStepDelay(2);
    expect(tutorialManager.currentStep).toBe(2);
    expect(
      document
        .querySelector("#target-scanner")
        .classList.contains("hud-highlight-glow"),
    ).toBe(true);
  });

  test("Step 2: Tracks target locks on hyperlane stargates and advances to Step 3", () => {
    tutorialManager.start();
    tutorialManager.currentStep = 2;

    const mockWarpGate = {
      id: "gate-1",
      type: "warp_gate",
      position: new Vector2D(500, 500),
    };
    renderer.entities = [mockWarpGate];

    // Trigger KeyT to cycle target scanner
    inputHandler.keys["KeyT"] = true;
    tutorialManager.update(0.1);

    expect(renderer.navigationTarget).toEqual(mockWarpGate);
    expect(tutorialManager.currentStep).toBe(3);
  });

  test("Step 3: Detects sector transition jumps and advances to Step 4", () => {
    tutorialManager.start();
    tutorialManager.currentStep = 3;
    player.position = new Vector2D(0, 0); // initial sector 'public'

    tutorialManager.update(0.1);
    expect(tutorialManager.initialSector).toBe("public");

    // Perform warp jump transition to 'rim' sector
    player.position = new Vector2D(-2000, 0);
    tutorialManager.update(0.1);

    expect(tutorialManager.currentStep).toBe(4);
  });

  test("Step 4: Detects docking clearance spaceport landings and advances to Step 5", () => {
    tutorialManager.start();
    tutorialManager.currentStep = 4;

    // Simulate landing
    const spaceportOverlay = document.getElementById("spaceport-overlay");
    spaceportOverlay.classList.remove("hidden");

    tutorialManager.update(0.1);

    expect(tutorialManager.currentStep).toBe(5);
  });

  test("Step 5: Hooks commodity market trades, completes onboarding and distributes rewards", () => {
    let msgSent = null;
    network.send = (msg) => {
      msgSent = msg;
    };

    tutorialManager.start();
    tutorialManager.currentStep = 5;

    // Simulate landing trade screen tab open
    const overlay = document.getElementById("spaceport-overlay");
    overlay.classList.remove("hidden");
    const tradeTab = overlay.querySelector("#tab-trade");
    tradeTab.classList.remove("hidden");

    // Hook trade triggers
    tutorialManager.hookTradingTransactions();

    // Trigger transaction click
    tradeTab.querySelector(".btn-trade-buy").click();

    // Force execute trade completion callback delay
    tutorialManager.completeTutorial();

    expect(tutorialManager.isActive).toBe(false);
    expect(player.credits).toBe(1500); // 1000 + 500 starter bonus
    expect(localStorage.getItem("nebula_tutorial_completed")).toBe("true");
    expect(msgSent).toEqual({ type: "tutorial_complete" });
  });
});
