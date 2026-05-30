import { describe, it, expect, beforeEach } from "vitest";
import { UIController } from "../UIController.js";

// Spec 021 — client test harness. Covers the additive combat-feedback HUD
// state machine in `UIController._updateCombatFeedback`: hit-flash vignette,
// shield-recharge lockout pip, boost indicator, heat-critical warning, and the
// low-resource bar pulses. These are pure decision logic over a player
// snapshot (no pixels), so a jsdom document with the cached HUD nodes is enough
// to observe the class/`display` toggles the renderer reacts to.

function mountHud() {
  document.body.innerHTML = `
    <div id="hud-shield-fill"></div>
    <div id="hud-energy-fill"></div>
    <div id="hud-heat-fill"></div>
    <div id="hud-heat-warning"></div>
    <div id="hud-shield-lockout"></div>
    <div id="hud-boost-indicator"></div>
    <div id="hit-flash-overlay"></div>
  `;
  return new UIController();
}

/** A minimal player snapshot — only the fields _updateCombatFeedback reads. */
function ship(overrides = {}) {
  return {
    shield: 100,
    armor: 100,
    energy: 100,
    isOverheated: false,
    isDestroyed: false,
    isDisabled: false,
    controls: {},
    ...overrides,
  };
}

describe("UIController combat-feedback HUD transitions", () => {
  /** @type {UIController} */
  let ui;

  beforeEach(() => {
    ui = mountHud();
  });

  it("does not flag a hit on the first frame (no prior total to compare)", () => {
    ui._updateCombatFeedback(ship({ shield: 100, armor: 50 }), 100, 100, 0);
    expect(ui._hitFlashTimerMs).toBe(0);
    expect(ui.hitFlashOverlay.classList.contains("flash-active")).toBe(false);
  });

  it("flashes a shield hit and opens the shield-recharge lockout", () => {
    ui._updateCombatFeedback(
      ship({ shield: 100, armor: 50, shieldRegenDelay: 3 }),
      100,
      100,
      0,
    );
    // Shield drops 30 between frames → a hit lands.
    ui._updateCombatFeedback(
      ship({ shield: 70, armor: 50, shieldRegenDelay: 3 }),
      70,
      100,
      0,
    );

    expect(ui._hitFlashTimerMs).toBeGreaterThan(0);
    expect(ui._hitFlashKind).toBe("shield");
    expect(ui.hitFlashOverlay.classList.contains("flash-active")).toBe(true);
    expect(ui.hitFlashOverlay.classList.contains("shield-hit")).toBe(true);

    // The locally-tracked combat lockout (shieldRegenDelay) is now armed.
    expect(ui._shieldLockoutMs).toBeGreaterThan(0);
    expect(ui.shieldLockoutPip.style.display).toBe("block");
    expect(ui.shieldBar.classList.contains("shield-locked")).toBe(true);
  });

  it("flashes an ARMOR hit (red) when armor is stripped with shields already down", () => {
    ui._updateCombatFeedback(ship({ shield: 0, armor: 100 }), 0, 100, 0);
    ui._updateCombatFeedback(ship({ shield: 0, armor: 70 }), 0, 100, 0);

    // spec 028: shield didn't move (0→0), so this is an armor hit — the red
    // vignette, NOT the shield-tinted one.
    expect(ui._hitFlashTimerMs).toBeGreaterThan(0);
    expect(ui._hitFlashKind).toBe("armor");
    expect(ui.hitFlashOverlay.classList.contains("flash-active")).toBe(true);
    expect(ui.hitFlashOverlay.classList.contains("shield-hit")).toBe(false);
  });

  it("flashes an ARMOR hit even with shields full when only armor drops", () => {
    // Shield stays full (100→100); armor takes the damage (100→80).
    ui._updateCombatFeedback(ship({ shield: 100, armor: 100 }), 100, 100, 0);
    ui._updateCombatFeedback(ship({ shield: 100, armor: 80 }), 100, 100, 0);

    expect(ui._hitFlashTimerMs).toBeGreaterThan(0);
    expect(ui._hitFlashKind).toBe("armor");
    expect(ui.hitFlashOverlay.classList.contains("shield-hit")).toBe(false);
  });

  it("clears the hit-flash overlay when no hit is active", () => {
    ui._updateCombatFeedback(ship(), 100, 100, 0);
    expect(ui.hitFlashOverlay.classList.contains("flash-active")).toBe(false);
    expect(ui.hitFlashOverlay.classList.contains("shield-hit")).toBe(false);
  });

  it("lights the boost indicator only while actively boosting with energy", () => {
    ui._updateCombatFeedback(
      ship({ energy: 50, controls: { isBoosting: true, isThrusting: true } }),
      100,
      50,
      0,
    );
    expect(ui.boostIndicator.style.display).toBe("block");
    expect(ui.energyBar.classList.contains("energy-boosting")).toBe(true);
  });

  it("suppresses the boost indicator when overheated", () => {
    ui._updateCombatFeedback(
      ship({
        energy: 50,
        isOverheated: true,
        controls: { isBoosting: true, isThrusting: true },
      }),
      100,
      50,
      0,
    );
    expect(ui.boostIndicator.style.display).toBe("none");
    expect(ui.energyBar.classList.contains("energy-boosting")).toBe(false);
  });

  it("raises the heat-critical pulse at/above 80% heat (pre-overheat)", () => {
    ui._updateCombatFeedback(ship(), 100, 100, 85);
    expect(ui.heatBar.classList.contains("heat-critical")).toBe(true);
    expect(ui.heatWarningPip.style.display).toBe("block");
  });

  it("keeps heat calm below the warning threshold", () => {
    ui._updateCombatFeedback(ship(), 100, 100, 50);
    expect(ui.heatBar.classList.contains("heat-critical")).toBe(false);
    expect(ui.heatWarningPip.style.display).toBe("none");
  });

  it("pulses the energy bar low when energy is scarce and not boosting", () => {
    ui._updateCombatFeedback(ship({ energy: 5 }), 100, 10, 0);
    expect(ui.energyBar.classList.contains("bar-low")).toBe(true);
  });

  it("shows the shield lockout pip from the engine's timeSinceLastHit", () => {
    ui._updateCombatFeedback(
      ship({ shield: 50, timeSinceLastHit: 0, shieldRegenDelay: 3 }),
      50,
      100,
      0,
    );
    expect(ui.shieldLockoutPip.style.display).toBe("block");
    expect(ui.shieldBar.classList.contains("shield-locked")).toBe(true);
  });
});
