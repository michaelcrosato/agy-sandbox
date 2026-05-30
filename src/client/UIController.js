/**
 * Bridges the background space physics engine variables with the HTML HUD dashboard elements.
 */
export class UIController {
  constructor() {
    // Cache DOM Elements
    this.shieldBar = document.getElementById("hud-shield-fill");
    this.armorBar = document.getElementById("hud-armor-fill");
    this.energyBar = document.getElementById("hud-energy-fill");
    this.heatBar = document.getElementById("hud-heat-fill");

    this.shieldVal = document.getElementById("hud-shield-text");
    this.armorVal = document.getElementById("hud-armor-text");
    this.energyVal = document.getElementById("hud-energy-text");
    this.heatVal = document.getElementById("hud-heat-text");
    this.overheatAlert = document.getElementById("hud-overheat-alert");
    this.heatWarningPip = document.getElementById("hud-heat-warning");
    this.shieldLockoutPip = document.getElementById("hud-shield-lockout");
    this.boostIndicator = document.getElementById("hud-boost-indicator");
    this.hitFlashOverlay = document.getElementById("hit-flash-overlay");

    // Internal client-only feedback timers — never feed back into the engine.
    // Tracks the previous combined shield+armor total so we can detect a hit
    // landing even in multiplayer where `timeSinceLastHit` ticks server-side.
    this._lastShieldTotal = null;
    this._hitFlashTimerMs = 0;
    this._hitFlashKind = null; // "shield" | "armor"
    this._shieldLockoutMs = 0; // local countdown matching engine shieldRegenDelay
    this._lastUpdateTs = 0;

    this.speedDisplay = document.getElementById("stat-speed");
    this.coordDisplay = document.getElementById("stat-coords");
    this.creditDisplay = document.getElementById("stat-credits");
    this.cargoDisplay = document.getElementById("stat-cargo");

    // Target Subpanel
    this.targetPanel = document.getElementById("target-scanner");
    this.targetName = document.getElementById("target-name");
    this.targetShieldFill = document.getElementById("target-shield-fill");
    this.targetArmorFill = document.getElementById("target-armor-fill");

    // Prompt HUD overlays
    this.landingPrompt = document.getElementById("landing-prompt");
    this.warpPrompt = document.getElementById("warp-prompt");
    this.notificationContainer = document.getElementById("notification-log");
    this.missionsList = document.getElementById("hud-missions-list");

    // Nebula status elements
    this.nebulaPanel = document.getElementById("nebula-status-hud");
    this.nebulaTitle = document.getElementById("nebula-hud-title");
    this.nebulaName = document.getElementById("nebula-hud-name");
    this.nebulaDetails = document.getElementById("nebula-hud-details");
  }

  /**
   * Pushes a floating text notification onto the HUD log list.
   * @param {string} text - Message.
   * @param {string} [type] - "success", "error", or "info".
   */
  notify(text, type = "info") {
    if (!this.notificationContainer) return;

    const el = document.createElement("div");
    el.className = `notification-badge ${type}`;
    el.innerText = text;

    this.notificationContainer.appendChild(el);

    // Keep only last 5 alerts
    while (this.notificationContainer.children.length > 5) {
      this.notificationContainer.removeChild(
        this.notificationContainer.firstChild,
      );
    }

    // Auto fadeout after 4 seconds
    setTimeout(() => {
      el.classList.add("fade-out");
      setTimeout(() => el.remove(), 500);
    }, 4000);
  }

  /**
   * Refreshes the active HUD dials using real-time simulation updates.
   * @param {Ship} player - Player entity.
   * @param {SpaceEntity} target - Selected target entity.
   * @param {Array<Planet>} planets - Loaded planets list to check landing zone prompts.
   * @param {Array} [nebulae] - Nebula hazards active.
   * @param {Array} [entities] - Active physics engine entities for proximity checks.
   */
  update(player, target, planets, nebulae = [], entities = []) {
    if (!player) return;

    // 1. Update Shields, Armor, Energy & Heat bars
    const shieldPct = Math.max(0, (player.shield / player.maxShield) * 100);
    const armorPct = Math.max(0, (player.armor / player.maxArmor) * 100);
    const energyPct = Math.max(
      0,
      ((player.energy || 0) / (player.maxEnergy || 100)) * 100,
    );
    const heatPct = Math.max(
      0,
      ((player.heat || 0) / (player.maxHeat || 100)) * 100,
    );

    if (this.shieldBar) this.shieldBar.style.width = `${shieldPct}%`;
    if (this.armorBar) this.armorBar.style.width = `${armorPct}%`;
    if (this.energyBar) this.energyBar.style.width = `${energyPct}%`;
    if (this.heatBar) this.heatBar.style.width = `${heatPct}%`;

    if (this.shieldVal)
      this.shieldVal.innerText = `${Math.floor(player.shield)} / ${player.maxShield}`;
    if (this.armorVal)
      this.armorVal.innerText = `${Math.floor(player.armor)} / ${player.maxArmor}`;
    if (this.energyVal)
      this.energyVal.innerText = `${Math.floor(player.energy || 0)} / ${player.maxEnergy || 100}`;
    if (this.heatVal) this.heatVal.innerText = `${Math.floor(heatPct)}%`;

    if (this.overheatAlert) {
      this.overheatAlert.style.display = player.isOverheated ? "block" : "none";
    }

    this._updateCombatFeedback(player, shieldPct, energyPct, heatPct);

    // 2. Update Stats
    const currentSpeed = Math.round(player.velocity.magnitude());
    if (this.speedDisplay) this.speedDisplay.innerText = `${currentSpeed} u/s`;

    const cx = Math.round(player.position.x);
    const cy = Math.round(player.position.y);
    if (this.coordDisplay) this.coordDisplay.innerText = `X: ${cx}, Y: ${cy}`;

    if (this.creditDisplay)
      this.creditDisplay.innerText = `${player.credits.toLocaleString()} CR`;

    const cargoWeight = player.getCargoWeight();
    if (this.cargoDisplay)
      this.cargoDisplay.innerText = `${cargoWeight} / ${player.cargoCapacity} t`;

    // 3. Update Targeting Scanner panel
    if (target && target.type === "ship" && !target.isDestroyed) {
      if (this.targetPanel) this.targetPanel.classList.add("visible");
      if (this.targetName) this.targetName.innerText = target.name;

      const tsPct = Math.max(0, (target.shield / target.maxShield) * 100);
      const taPct = Math.max(0, (target.armor / target.maxArmor) * 100);

      if (this.targetShieldFill)
        this.targetShieldFill.style.width = `${tsPct}%`;
      if (this.targetArmorFill) this.targetArmorFill.style.width = `${taPct}%`;
    } else {
      if (this.targetPanel) this.targetPanel.classList.remove("visible");
    }

    // 4. Update planetary landing proximity alerts
    let canLandOnAny = null;
    for (const p of planets) {
      if (p.canLand(player)) {
        canLandOnAny = p;
        break;
      }
    }

    if (canLandOnAny && this.landingPrompt) {
      this.landingPrompt.innerHTML = `LOCKED FOR LANDING IN range OF <strong>${canLandOnAny.name.toUpperCase()}</strong><br><small>PRESS [L] TO LAND SPACEPORT</small>`;
      this.landingPrompt.classList.add("visible");
    } else if (this.landingPrompt) {
      this.landingPrompt.classList.remove("visible");
    }

    // Update warp gate proximity alerts
    let nearWarpGate = null;
    for (const ent of entities) {
      if (ent.type === "warp_gate") {
        const dist = player.position.distance(ent.position);
        if (dist <= 150) {
          nearWarpGate = ent;
          break;
        }
      }
    }

    if (nearWarpGate && this.warpPrompt) {
      const dest = nearWarpGate.targetSector
        ? nearWarpGate.targetSector.toUpperCase()
        : "UNKNOWN";
      this.warpPrompt.innerHTML = `LOCKED ON HYPERLANE TO <strong>${dest} SECTOR</strong><br><small>PRESS [J] TO ENGAGE WARP DRIVE (20 HYPER-FUEL)</small>`;
      this.warpPrompt.classList.add("visible");
    } else if (this.warpPrompt) {
      this.warpPrompt.classList.remove("visible");
    }

    // 5. Update active nebula status panel
    let currentNebula = null;
    if (player && !player.isDestroyed) {
      for (const neb of nebulae) {
        const dx = player.position.x - neb.position.x;
        const dy = player.position.y - neb.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= neb.radius) {
          currentNebula = neb;
          break;
        }
      }
    }

    if (currentNebula && this.nebulaPanel) {
      this.nebulaPanel.classList.add("visible");
      if (this.nebulaName)
        this.nebulaName.innerText = currentNebula.name.toUpperCase();

      let title; // set by every branch of the hazardType chain below
      let details = `DRAG: ${currentNebula.dragMultiplier}x | `;
      let color = "rgba(192, 128, 255, 0.7)"; // violet
      let glow = "rgba(192, 128, 255, 0.3)";

      if (currentNebula.hazardType === "friction") {
        title = "STATIC FRICTION DETECTED";
        details += "HAZARD: MOVEMENT DRAG";
        color = "rgba(255, 59, 48, 0.7)"; // red
        glow = "rgba(255, 59, 48, 0.3)";
      } else if (currentNebula.hazardType === "shield_dampen") {
        title = "SHIELD DAMPENER ACTIVE";
        details += "HAZARD: -50% REGEN RATE";
        color = "rgba(0, 191, 255, 0.7)"; // sky blue
        glow = "rgba(0, 191, 255, 0.3)";
      } else {
        title = "FULL RADAR CLOAK ACTIVE";
        details += "STEALTH: 100% UNTRACEABLE";
      }

      if (this.nebulaTitle) {
        this.nebulaTitle.innerText = title;
        this.nebulaTitle.style.color = color;
      }
      if (this.nebulaDetails) this.nebulaDetails.innerText = details;

      this.nebulaPanel.style.borderColor = color;
      this.nebulaPanel.style.boxShadow = `0 0 15px ${glow}`;
    } else if (this.nebulaPanel) {
      this.nebulaPanel.classList.remove("visible");
    }
  }

  /**
   * Drives the additive combat-feel HUD cues: boost indicator, shield-recharge
   * lockout pip, low-resource bar pulses, heat-critical warning, and a brief
   * red/blue vignette flash when the player loses armor or shield. All state
   * is client-only and never feeds back into the engine.
   *
   * @param {Ship} player - Local player ship snapshot.
   * @param {number} shieldPct - Current shield as 0-100.
   * @param {number} energyPct - Current energy as 0-100.
   * @param {number} heatPct - Current heat as 0-100.
   */
  _updateCombatFeedback(player, shieldPct, energyPct, heatPct) {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const dtMs = this._lastUpdateTs
      ? Math.min(250, now - this._lastUpdateTs)
      : 0;
    this._lastUpdateTs = now;

    // 1. Hit detection: any drop in shield+armor since the last frame is a hit.
    const currentTotal = (player.shield || 0) + (player.armor || 0);
    if (
      this._lastShieldTotal !== null &&
      currentTotal < this._lastShieldTotal - 0.5
    ) {
      const shieldDropped =
        (player.shield || 0) <
        this._lastShieldTotal - (player.armor || 0) - 0.5;
      this._hitFlashTimerMs = 320;
      this._hitFlashKind = shieldDropped ? "shield" : "armor";
      // Combat lockout matches the engine's shieldRegenDelay (default 3s).
      this._shieldLockoutMs = (player.shieldRegenDelay || 3) * 1000;
    }
    this._lastShieldTotal = currentTotal;

    if (this._hitFlashTimerMs > 0) {
      this._hitFlashTimerMs = Math.max(0, this._hitFlashTimerMs - dtMs);
    }
    if (this._shieldLockoutMs > 0) {
      this._shieldLockoutMs = Math.max(0, this._shieldLockoutMs - dtMs);
    }

    // 2. Hit-flash vignette
    if (this.hitFlashOverlay) {
      if (this._hitFlashTimerMs > 0) {
        this.hitFlashOverlay.classList.add("flash-active");
        this.hitFlashOverlay.classList.toggle(
          "shield-hit",
          this._hitFlashKind === "shield",
        );
      } else {
        this.hitFlashOverlay.classList.remove("flash-active");
        this.hitFlashOverlay.classList.remove("shield-hit");
      }
    }

    // 3. Boost indicator: only "live" when player is actively boosting and has energy.
    const controls = player.controls || {};
    const energyOk = (player.energy || 0) > 0;
    const isBoosting = !!(
      controls.isBoosting &&
      controls.isThrusting &&
      energyOk &&
      !player.isOverheated
    );
    if (this.boostIndicator) {
      this.boostIndicator.style.display = isBoosting ? "block" : "none";
    }
    if (this.energyBar) {
      this.energyBar.classList.toggle("energy-boosting", isBoosting);
    }

    // 4. Shield-recharge combat lockout pip. Engine exposes timeSinceLastHit
    // locally in single-player; in multiplayer that field doesn't tick on the
    // client, so we fall back to the locally-tracked hit timer.
    const engineLockoutActive =
      typeof player.timeSinceLastHit === "number" &&
      typeof player.shieldRegenDelay === "number" &&
      player.timeSinceLastHit < player.shieldRegenDelay;
    const lockoutActive =
      !player.isDestroyed &&
      !player.isDisabled &&
      shieldPct < 99.5 &&
      (engineLockoutActive || this._shieldLockoutMs > 0);
    if (this.shieldLockoutPip) {
      this.shieldLockoutPip.style.display = lockoutActive ? "block" : "none";
    }
    if (this.shieldBar) {
      this.shieldBar.classList.toggle("shield-locked", lockoutActive);
    }

    // 5. Low-resource pulses
    if (this.shieldBar) {
      this.shieldBar.classList.toggle(
        "bar-low",
        !lockoutActive && shieldPct > 0 && shieldPct < 25,
      );
    }
    if (this.energyBar) {
      this.energyBar.classList.toggle("bar-low", !isBoosting && energyPct < 20);
    }

    // 6. Heat-critical pulse (warning before full overheat)
    const heatCritical = !player.isOverheated && heatPct >= 80;
    if (this.heatBar) {
      this.heatBar.classList.toggle(
        "heat-critical",
        heatCritical || player.isOverheated,
      );
    }
    if (this.heatWarningPip) {
      this.heatWarningPip.style.display = heatCritical ? "block" : "none";
    }
  }

  /**
   * Refreshes the flight HUD active contracts list.
   * @param {Array<Object>} activeMissions - Current active missions list.
   */
  updateActiveMissionsHUD(activeMissions = []) {
    if (!this.missionsList) return;

    if (activeMissions.length === 0) {
      this.missionsList.innerHTML = `<div class="empty-tracker">No active contracts</div>`;
      return;
    }

    this.missionsList.innerHTML = "";
    for (const m of activeMissions) {
      const itemEl = document.createElement("div");
      itemEl.className = `tracker-item ${m.type}`;

      let objectiveText = "";
      if (m.type === "courier" || m.type === "smuggle") {
        objectiveText = `Deliver ${m.cargoAmount}t ${m.cargoItem} to ${m.destination}`;
      } else if (m.type === "bounty") {
        objectiveText = `Neutralize ${m.targetName} in orbit of ${m.destination}`;
      } else if (m.type === "storyline") {
        objectiveText =
          m.objectiveText ||
          (m.stage === 1
            ? `Deliver archives to ${m.destination}`
            : `Defeat ${m.targetName} in orbit of ${m.destination}`);
      }

      itemEl.innerHTML = `
        <span class="tracker-title">${m.title}</span>
        <span class="tracker-objective"><span class="objective-check">□</span> ${objectiveText}</span>
      `;
      this.missionsList.appendChild(itemEl);
    }
  }
}
