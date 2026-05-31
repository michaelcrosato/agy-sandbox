/**
 * @typedef {Object} TutorialStep
 * @property {number} index - Step index.
 * @property {string} title - Step title.
 * @property {string} instruction - Instructive guidance text.
 * @property {string[]} tasks - Tasks description array.
 * @property {string} highlightId - Selector id or class to highlight in CSS.
 */

/**
 * Interactive Neon Onboarding Tutorial & Cockpit HUD Guide (SPEC-105/SPEC-158).
 * Coordinates steps: thrust_maneuver, lock_target, destroy_drone, collect_salvage, dock_at_port.
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
    this.currentStep = "thrust_maneuver"; // State machine string step keys

    // Trackers for movement mastery in step 1 (thrust_maneuver)
    this.rotationTracked = false;
    this.thrustTracked = false;

    // Cache the UI dialog card element
    this.cardEl = null;

    /** @type {Record<string, TutorialStep>} */
    this.STEPS = {
      thrust_maneuver: {
        index: 1,
        title: "THRUSTERS & AGILITY",
        instruction:
          "Welcome, Pilot! Let's master basic spaceflight. Use Arrow Keys or WASD to steer and ignite your engines.",
        tasks: [
          "Rotate Left/Right (Steering)",
          "Ignite Thrusters (Forward movement)",
        ],
        highlightId: ".right-hud",
      },
      lock_target: {
        index: 2,
        title: "STARGATE TARGET LOCK",
        instruction:
          "Excellent control! Lock your target scanner on the local Training Drone entity to map tactical trajectories.",
        tasks: ["Press [T] to Lock Target Scanner"],
        highlightId: "#target-scanner",
      },
      destroy_drone: {
        index: 3,
        title: "TACTICAL ENGAGEMENT",
        instruction:
          "Weapons hot! Fire your blasters at the Training Drone until it is completely neutralized.",
        tasks: ["Engage Blasters [Space] & Neutralize Drone"],
        highlightId: "#combat-hud",
      },
      collect_salvage: {
        index: 4,
        title: "CARGO HARVESTING",
        instruction:
          "Training Drone destroyed! Fly close to the dropped wreckage salvage pod (< 100 u) to scoop it.",
        tasks: ["Harvest Wreckage Salvage Pod"],
        highlightId: "#cargo-hold",
      },
      dock_at_port: {
        index: 5,
        title: "SPACEPORT DOCKING",
        instruction:
          "Onboarding objectives completed! Fly close to the planet's spaceport and press [L] to dock.",
        tasks: ["Dock at spaceport [L] to complete flight guide"],
        highlightId: "#landing-prompt",
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

    // Gold-glassmorphic styling
    el.className = "glass-panel";
    el.style.position = "absolute";
    el.style.top = "160px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.width = "380px";
    el.style.padding = "20px";
    el.style.zIndex = "9999";
    el.style.textAlign = "center";
    el.style.background = "rgba(18, 14, 5, 0.85)";
    el.style.backdropFilter = "blur(12px)";
    el.style.border = "1px solid rgba(218, 165, 32, 0.45)";
    el.style.boxShadow =
      "0 0 20px rgba(218, 165, 32, 0.25), var(--shadow-premium)";

    el.innerHTML = `
      <h3 style="color: #ffd700; text-shadow: 0 0 8px rgba(255, 215, 0, 0.6); font-size: 14px; margin-bottom: 8px;">COCKPIT ONBOARDING</h3>
      <p style="font-size: 11px; line-height: 1.5; color: rgba(240, 242, 250, 0.85); margin-bottom: 16px;">
        Welcome to the Nebula Sector, Pilot. Would you like to run the interactive flight guide to master thrusters, target locking, combat, salvage harvesting, and docking? Completed pilots receive a 500 CR reward.
      </p>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="btn-tutorial-start" class="btn-primary" style="padding: 6px 16px; font-size: 9px; pointer-events: auto; border-color: rgba(218, 165, 32, 0.5); color: #ffd700; background: rgba(218, 165, 32, 0.1);">LAUNCH FLIGHT GUIDE</button>
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
    this.currentStep = "thrust_maneuver";
    this.rotationTracked = false;
    this.thrustTracked = false;

    this.uiController.notify("Flight Onboarding Guide ENGAGED.", "success");

    if (this.network && this.network.connected) {
      this.network.send({ type: "tutorial_start" });
    }

    this.renderStepCard();
    this.applyStepHighlights();
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
   * Receives server-authoritative step synchronization messages.
   * @param {Object} msg - WS tutorial state payload.
   */
  handleServerState(msg) {
    if (!this.isActive) return;

    if (msg.step) {
      if (msg.step === "completed") {
        this.completeTutorial();
        return;
      }

      this.currentStep = msg.step;
      if (msg.step === "thrust_maneuver") {
        this.rotationTracked = !!msg.isRotationDone;
        this.thrustTracked = !!msg.isThrustDone;
      }
      this.renderStepCard();
      this.applyStepHighlights();
    }
  }

  /**
   * Dynamically renders/updates the floating golden-glassmorphic step dialog card.
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

    // Gold-glassmorphic styling
    el.className = "glass-panel";
    el.style.position = "absolute";
    el.style.top = "150px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.width = "380px";
    el.style.padding = "16px";
    el.style.zIndex = "9999";
    el.style.background = "rgba(18, 14, 5, 0.85)";
    el.style.backdropFilter = "blur(12px)";
    el.style.border = "1px solid rgba(218, 165, 32, 0.45)";
    el.style.boxShadow =
      "0 0 20px rgba(218, 165, 32, 0.25), var(--shadow-premium)";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.gap = "10px";

    let taskListHtml = "";
    if (this.currentStep === "thrust_maneuver") {
      taskListHtml = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">
          <span style="display: inline-flex; width: 12px; height: 12px; border: 1px solid ${this.rotationTracked ? "#ffd700" : "rgba(255,255,255,0.3)"}; border-radius: 3px; justify-content: center; align-items: center; font-size: 8px; color: #ffd700; background: ${this.rotationTracked ? "rgba(218,165,32,0.15)" : "transparent"}">${this.rotationTracked ? "✓" : ""}</span>
          <span style="color: ${this.rotationTracked ? "rgba(240,242,250,0.6)" : "var(--color-text-primary)"}">Rotate Ship [A/D or Left/Right]</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">
          <span style="display: inline-flex; width: 12px; height: 12px; border: 1px solid ${this.thrustTracked ? "#ffd700" : "rgba(255,255,255,0.3)"}; border-radius: 3px; justify-content: center; align-items: center; font-size: 8px; color: #ffd700; background: ${this.thrustTracked ? "rgba(218,165,32,0.15)" : "transparent"}">${this.thrustTracked ? "✓" : ""}</span>
          <span style="color: ${this.thrustTracked ? "rgba(240,242,250,0.6)" : "var(--color-text-primary)"}">Ignite Thrusters [W or UpArrow]</span>
        </div>
      `;
    } else {
      step.tasks.forEach((t) => {
        taskListHtml += `
          <div style="display: flex; align-items: center; gap: 8px; font-size: 10px;">
            <span style="display: inline-flex; width: 12px; height: 12px; border: 1px solid #ffd700; border-radius: 3px; justify-content: center; align-items: center; font-size: 8px; color: #ffd700; background: rgba(218,165,32,0.1)"></span>
            <span>${t}</span>
          </div>
        `;
      });
    }

    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: var(--font-display); font-size: 11px; color: #ffd700; text-shadow: 0 0 6px rgba(255, 215, 0, 0.4); font-weight: bold; letter-spacing: 1px;">${step.title}</span>
        <span style="font-size: 8px; color: var(--color-text-secondary); text-transform: uppercase;">Step ${step.index} of 5</span>
      </div>
      <p style="font-size: 11px; line-height: 1.45; color: rgba(240, 242, 250, 0.9);">${step.instruction}</p>
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

    if (!this.player || this.player.isDestroyed) {
      return;
    }

    // Step 1 local tracking
    if (this.currentStep === "thrust_maneuver") {
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
    }
  }

  /**
   * Transition steps smoothly after a brief delay to ensure high visual satisfaction.
   * @param {string} nextStep - The step key to advance to.
   */
  advanceStepDelay(nextStep) {
    this.currentStep = nextStep;

    this.uiController.notify("Objective Completed!", "success");

    // Run layout updates immediately to avoid test synchronization issues
    if (this.isActive) {
      this.renderStepCard();
      this.applyStepHighlights();
    }
  }

  /**
   * Concludes the onboarding tutorial, issuing reward and synchronizing server profile.
   */
  completeTutorial() {
    if (!this.isActive) return;

    this.isActive = false;
    this.removeCard();
    this.clearAllHighlights();

    if (this.player) {
      this.player.credits = (this.player.credits || 0) + 500;
    }

    localStorage.setItem("nebula_tutorial_completed", "true");

    if (this.network && this.network.connected) {
      this.network.send({ type: "tutorial_complete" });
    }

    this.uiController.notify("ONBOARDING CERTIFICATION COMPLETED!", "success");
    this.uiController.notify(
      "Starter Economy package awarded: +500 CR!",
      "success",
    );
  }
}
