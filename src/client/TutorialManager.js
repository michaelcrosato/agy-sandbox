/**
 * @typedef {Object} TutorialStep
 * @property {string} title - Step title.
 * @property {string} instruction - Instructive guidance text.
 * @property {string[]} tasks - Tasks description array.
 * @property {string} highlightId - Selector id or class to highlight in CSS.
 */

/**
 * Interactive Neon Onboarding Tutorial & Cockpit HUD Guide (SPEC-105).
 * Coordinates steps of flight mechanics, targeting, warp, docking, and trading.
 */
export class TutorialManager {
  /**
   * Constructs the TutorialManager.
   * @param {Object} context - Object wrapping core client references.
   * @param {Object} context.player - Local client player ship.
   * @param {Object} context.uiController - UIController instance bridging state and HTML.
   * @param {Object} context.inputHandler - Keyboard InputHandler.
   * @param {Object} context.spaceportUI - SpaceportUI panel controller.
   * @param {Object} context.renderer - CanvasRenderer scene renderer.
   * @param {Object} [context.network] - Optional NetworkHandler.
   */
  constructor(context) {
    this.player = context.player;
    this.uiController = context.uiController;
    this.inputHandler = context.inputHandler;
    this.spaceportUI = context.spaceportUI;
    this.renderer = context.renderer;
    this.network = context.network || null;

    this.isActive = false;
    this.currentStep = 1;

    // Trackers for movement mastery in step 1
    this.rotationTracked = false;
    this.thrustTracked = false;

    // Track sector changes in step 3
    this.initialSector = null;

    // Cache the UI dialog card element
    this.cardEl = null;

    /** @type {Record<number, TutorialStep>} */
    this.STEPS = {
      1: {
        title: "THRUSTERS & AGILITY",
        instruction:
          "Welcome, Pilot! Let's master basic spaceflight. Use Arrow Keys or WASD to steer and ignite your engines.",
        tasks: [
          "Rotate Left/Right (Steering)",
          "Ignite Thrusters (Forward movement)",
        ],
        highlightId: ".right-hud",
      },
      2: {
        title: "STARGATE TARGET LOCK",
        instruction:
          "Excellent control! Lock your target scanner on the local hyperlane stargate portal to get route coordinates.",
        tasks: ["Press [T] to Lock Stargate Scanner"],
        highlightId: "#target-scanner",
      },
      3: {
        title: "SECTOR HYPERSPACE JUMP",
        instruction:
          "A hyperlane stargate connects sectors. Fly near the stargate (< 150 u) and press [J] to engage warp drive.",
        tasks: ["Perform Sector Warp Jump"],
        highlightId: "#warp-prompt",
      },
      4: {
        title: "SPACEPORT DOCKING",
        instruction:
          "Welcome to the new sector! Fly close to the planet spaceport (< 250 u) at low speed (< 80 u/s) and press [L] to land.",
        tasks: ["Secure Clearance and Land [L]"],
        highlightId: "#landing-prompt",
      },
      5: {
        title: "COMMODITY TRANSACTION",
        instruction:
          "Systems secured! Open the planetary trade market panel and purchase or sell 1 ton of any commodity.",
        tasks: ["Complete Cargo Purchase or Sale"],
        highlightId: "#spaceport-overlay",
      },
    };
  }

  /**
   * Initializes the onboarding flow, checking if we should ask the player to start.
   * If they haven't completed the tutorial, we show a gorgeous onboarding choice banner.
   */
  checkOnboarding() {
    const isCompleted =
      localStorage.getItem("nebula_tutorial_completed") === "true";
    if (isCompleted) {
      return;
    }

    // Also check if server already marked this player profile complete
    if (this.network && this.network.tutorialCompleted) {
      localStorage.setItem("nebula_tutorial_completed", "true");
      return;
    }

    this.showPromptCard();
  }

  /**
   * Renders the initial opt-in choice floating dialog banner.
   */
  showPromptCard() {
    this.removeCard();

    const parent = document.getElementById("game-viewport");
    if (!parent) return;

    const el = document.createElement("div");
    el.id = "tutorial-prompt-card";
    el.className = "glass-panel";
    el.style.position = "absolute";
    el.style.top = "160px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.width = "380px";
    el.style.padding = "20px";
    el.style.zIndex = "9999";
    el.style.textAlign = "center";
    el.style.border = "1px solid var(--color-cyan)";
    el.style.boxShadow =
      "0 0 15px var(--color-cyan-glow), var(--shadow-premium)";

    el.innerHTML = `
      <h3 style="color: var(--color-cyan); text-shadow: 0 0 8px var(--color-cyan-glow); font-size: 14px; margin-bottom: 8px;">COCKPIT ONBOARDING</h3>
      <p style="font-size: 11px; line-height: 1.5; color: rgba(240, 242, 250, 0.85); margin-bottom: 16px;">
        Welcome to the Nebula Sector, Pilot. Would you like to run the interactive flight guide to master thrusters, target locking, stargates, and trading? Completed pilots receive a 500 CR reward.
      </p>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="btn-tutorial-start" class="btn-primary" style="padding: 6px 16px; font-size: 9px; pointer-events: auto;">LAUNCH FLIGHT GUIDE</button>
        <button id="btn-tutorial-skip" class="btn-primary" style="padding: 6px 16px; font-size: 9px; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.25); color: #8a90a6; pointer-events: auto;">BYPASS</button>
      </div>
    `;

    parent.appendChild(el);

    el.querySelector("#btn-tutorial-start").addEventListener("click", () => {
      el.remove();
      this.start();
    });

    el.querySelector("#btn-tutorial-skip").addEventListener("click", () => {
      el.remove();
      this.bypass();
    });
  }

  /**
   * Activates the onboarding tutorial sequence.
   */
  start() {
    this.isActive = true;
    this.currentStep = 1;
    this.rotationTracked = false;
    this.thrustTracked = false;
    this.initialSector = null;

    this.uiController.notify("Flight Onboarding Guide ENGAGED.", "success");
    this.renderStepCard();
    this.applyStepHighlights();

    // Hook trade completions to track step 5
    if (this.spaceportUI) {
      const origRender = this.spaceportUI.renderTrade.bind(this.spaceportUI);
      this.spaceportUI.renderTrade = () => {
        origRender();
        // Hook trading buttons to capture completed transactions
        this.hookTradingTransactions();
      };
    }
  }

  /**
   * Bypasses the tutorial completely, persisting state and shutting down overlays.
   */
  bypass() {
    this.isActive = false;
    localStorage.setItem("nebula_tutorial_completed", "true");
    this.removeCard();
    this.clearAllHighlights();

    if (this.network && this.network.connected) {
      this.network.send({ type: "tutorial_complete" });
    }
    this.uiController.notify(
      "Onboarding bypassed. Standard flight rules active.",
      "info",
    );
  }

  /**
   * Dynamically renders/updates the floating neon step dialog card.
   */
  renderStepCard() {
    this.removeCard();

    if (!this.isActive) return;

    const parent = document.getElementById("game-viewport");
    if (!parent) return;

    const step = this.STEPS[this.currentStep];
    if (!step) return;

    const el = document.createElement("div");
    el.id = "tutorial-step-card";
    el.className = "glass-panel";
    el.style.position = "absolute";
    el.style.top = "150px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.width = "380px";
    el.style.padding = "16px";
    el.style.zIndex = "9999";
    el.style.border = "1px solid var(--color-cyan)";
    el.style.boxShadow =
      "0 0 15px var(--color-cyan-glow), var(--shadow-premium)";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.gap = "10px";

    let taskListHtml = "";
    if (this.currentStep === 1) {
      taskListHtml = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">
          <span style="display: inline-flex; width: 12px; height: 12px; border: 1px solid ${this.rotationTracked ? "#00ff88" : "rgba(255,255,255,0.3)"}; border-radius: 3px; justify-content: center; align-items: center; font-size: 8px; color: #00ff88; background: ${this.rotationTracked ? "rgba(0,255,136,0.15)" : "transparent"}">${this.rotationTracked ? "✓" : ""}</span>
          <span style="color: ${this.rotationTracked ? "rgba(240,242,250,0.6)" : "var(--color-text-primary)"}">Rotate Ship [A/D or Left/Right]</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">
          <span style="display: inline-flex; width: 12px; height: 12px; border: 1px solid ${this.thrustTracked ? "#00ff88" : "rgba(255,255,255,0.3)"}; border-radius: 3px; justify-content: center; align-items: center; font-size: 8px; color: #00ff88; background: ${this.thrustTracked ? "rgba(0,255,136,0.15)" : "transparent"}">${this.thrustTracked ? "✓" : ""}</span>
          <span style="color: ${this.thrustTracked ? "rgba(240,242,250,0.6)" : "var(--color-text-primary)"}">Ignite Thrusters [W or UpArrow]</span>
        </div>
      `;
    } else {
      step.tasks.forEach((t) => {
        taskListHtml += `
          <div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">
            <span style="display: inline-flex; width: 12px; height: 12px; border: 1px solid rgba(255,255,255,0.3); border-radius: 3px; justify-content: center; align-items: center; font-size: 8px; color: #00ff88;"></span>
            <span>${t}</span>
          </div>
        `;
      });
    }

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: var(--font-display); font-size: 11px; color: var(--color-cyan); text-shadow: 0 0 6px var(--color-cyan-glow); font-weight: bold; letter-spacing: 1px;">${step.title}</span>
        <span style="font-size: 8px; color: var(--color-text-secondary); text-transform: uppercase;">Step ${this.currentStep} of 5</span>
      </div>
      <p style="font-size: 11px; line-height: 1.45; color: rgba(240,242,250,0.9);">${step.instruction}</p>
      <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 2px;">
        ${taskListHtml}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; margin-top: 2px;">
        <button id="btn-tutorial-card-skip" style="background: transparent; border: none; font-family: var(--font-display); font-size: 8px; color: #8a90a6; text-transform: uppercase; cursor: pointer; pointer-events: auto;">Bypass Guide</button>
        <span style="font-size: 8px; color: var(--color-text-secondary); opacity: 0.6;">AFK auto-save active</span>
      </div>
    `;

    parent.appendChild(el);
    this.cardEl = el;

    el.querySelector("#btn-tutorial-card-skip").addEventListener(
      "click",
      () => {
        this.bypass();
      },
    );
  }

  /**
   * Removes any active onboarding dialog cards from DOM.
   */
  removeCard() {
    const el = document.getElementById("tutorial-step-card");
    if (el) el.remove();
    const prompt = document.getElementById("tutorial-prompt-card");
    if (prompt) prompt.remove();
    this.cardEl = null;
  }

  /**
   * Applies glowing CSS highlights on HUD HTML elements corresponding to step.
   */
  applyStepHighlights() {
    this.clearAllHighlights();

    if (!this.isActive) return;

    const step = this.STEPS[this.currentStep];
    if (!step || !step.highlightId) return;

    const targetEl = document.querySelector(step.highlightId);
    if (targetEl) {
      targetEl.classList.add("hud-highlight-glow");
    }
  }

  /**
   * Removes all highlight glow classes globally.
   */
  clearAllHighlights() {
    document.querySelectorAll(".hud-highlight-glow").forEach((el) => {
      el.classList.remove("hud-highlight-glow");
    });
  }

  /**
   * Updates state trackers and advances the FSM step logic dynamically (called inside gameLoop).
   * @param {number} _dt - Delta time in seconds.
   */
  update(_dt) {
    if (!this.isActive) return;

    // A. Verify player entity is alive
    if (!this.player || this.player.isDestroyed) {
      return;
    }

    // B. State verification depending on step
    switch (this.currentStep) {
      case 1:
        // Steer/Thrust Tracking
        if (!this.rotationTracked) {
          const keys = this.inputHandler.keys;
          if (
            keys["ArrowLeft"] ||
            keys["ArrowRight"] ||
            keys["KeyA"] ||
            keys["KeyD"]
          ) {
            this.rotationTracked = true;
            this.renderStepCard();
          }
        }
        if (!this.thrustTracked) {
          const keys = this.inputHandler.keys;
          if (keys["ArrowUp"] || keys["KeyW"]) {
            this.thrustTracked = true;
            this.renderStepCard();
          }
        }
        if (this.rotationTracked && this.thrustTracked) {
          this.advanceStepDelay(2);
        }
        break;

      case 2: {
        // Stargate lock tracking
        // If they lock onto a stargate (warp gate) or if renderer has navigationTarget, advance
        const hasGateTarget =
          this.renderer.navigationTarget &&
          this.renderer.navigationTarget.type === "warp_gate";
        if (hasGateTarget) {
          this.advanceStepDelay(3);
        } else {
          // Listen to KeyT during step 2 to cycle/target nearest stargate automatically
          const keys = this.inputHandler.keys;
          if (keys["KeyT"]) {
            // Find nearest stargate in local entities
            const localGate = this.renderer.entities?.find(
              (ent) => ent.type === "warp_gate",
            );
            if (localGate) {
              this.renderer.navigationTarget = localGate;
              this.uiController.notify(
                "Scanner target lock engaged: stargate hyperlane mapped!",
                "info",
              );
              this.advanceStepDelay(3);
            }
          }
        }
        break;
      }

      case 3: {
        // Sector jump tracking
        // Initialize current sector on entrance of Step 3
        if (!this.initialSector) {
          this.initialSector = this.getSectorFromPosition(this.player.position);
        }
        // If current sector is different than initial sector, warp completed
        const curSec = this.getSectorFromPosition(this.player.position);
        if (this.initialSector && curSec !== this.initialSector) {
          this.advanceStepDelay(4);
        }
        break;
      }

      case 4: {
        // Spaceport landing tracking
        // Check if isLanded variable from outer game is true (or if spaceport panel is visible)
        // Since isLanded is a global or main scope, we can check if spaceport panel overlay is open
        const spaceportOverlay = document.getElementById("spaceport-overlay");
        const isOpen =
          spaceportOverlay && !spaceportOverlay.classList.contains("hidden");
        if (isOpen) {
          this.advanceStepDelay(5);
        }
        break;
      }

      case 5:
        // Trade tracking - handled by click event hook inside hookTradingTransactions
        break;
    }
  }

  /**
   * Helper to resolve the sector name from player coordinates.
   * @param {Vector2D} pos - Position vector.
   * @returns {string} Sector name.
   */
  getSectorFromPosition(pos) {
    if (!pos) return "unknown";
    // standard coordinates boundaries
    if (pos.x < -1500) return "rim";
    if (pos.x > 1500) return "core";
    return "public";
  }

  /**
   * Transition steps smoothly after a brief delay to ensure high visual satisfaction.
   * @param {number} nextStep - The step index to advance to.
   */
  advanceStepDelay(nextStep) {
    // Only trigger once
    if (this.currentStep >= nextStep) return;

    this.currentStep = nextStep;

    this.uiController.notify("Objective Completed!", "success");

    setTimeout(() => {
      if (!this.isActive) return;
      this.renderStepCard();
      this.applyStepHighlights();
    }, 1000);
  }

  /**
   * Hooks into the trade buttons inside SpaceportUI to capture completed commodity transactions.
   */
  hookTradingTransactions() {
    if (this.currentStep !== 5) return;

    const overlay = document.getElementById("spaceport-overlay");
    if (!overlay) return;

    const tradePanel = overlay.querySelector("#tab-trade");
    if (!tradePanel || tradePanel.classList.contains("hidden")) return;

    // Query both buy and sell buttons inside trade panel
    const tradeButtons = tradePanel.querySelectorAll(
      ".btn-trade-buy, .btn-trade-sell",
    );
    tradeButtons.forEach((btn) => {
      // Add a single-click event tracking completion
      btn.addEventListener("click", () => {
        // Delay slightly to confirm state completes successfully
        setTimeout(() => {
          this.completeTutorial();
        }, 100);
      });
    });
  }

  /**
   * Concludes the onboarding tutorial, issuing reward and synchronizing server profile.
   */
  completeTutorial() {
    if (!this.isActive) return;

    this.isActive = false;
    this.removeCard();
    this.clearAllHighlights();

    // 1. Award reward credits starter package (+500 CR)
    if (this.player) {
      this.player.credits = (this.player.credits || 0) + 500;
    }

    // 2. Persist completion to localStorage
    localStorage.setItem("nebula_tutorial_completed", "true");

    // 3. Issue authoritative network synchronizer message
    if (this.network && this.network.connected) {
      this.network.send({ type: "tutorial_complete" });
    }

    // 4. Trigger celebration notifications and sounds
    this.uiController.notify("ONBOARDING CERTIFICATION COMPLETED!", "success");
    this.uiController.notify(
      "Starter Economy package awarded: +500 CR!",
      "success",
    );
  }
}
