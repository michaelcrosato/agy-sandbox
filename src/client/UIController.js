/**
 * Bridges the background space physics engine variables with the HTML HUD dashboard elements.
 */
export class UIController {
  constructor() {
    // Cache DOM Elements
    this.shieldBar = document.getElementById("hud-shield-fill");
    this.armorBar = document.getElementById("hud-armor-fill");

    this.shieldVal = document.getElementById("hud-shield-text");
    this.armorVal = document.getElementById("hud-armor-text");

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
    this.notificationContainer = document.getElementById("notification-log");
    this.missionsList = document.getElementById("hud-missions-list");
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
   */
  update(player, target, planets) {
    if (!player) return;

    // 1. Update Shields & Armor bars
    const shieldPct = Math.max(0, (player.shield / player.maxShield) * 100);
    const armorPct = Math.max(0, (player.armor / player.maxArmor) * 100);

    if (this.shieldBar) this.shieldBar.style.width = `${shieldPct}%`;
    if (this.armorBar) this.armorBar.style.width = `${armorPct}%`;

    if (this.shieldVal)
      this.shieldVal.innerText = `${Math.floor(player.shield)} / ${player.maxShield}`;
    if (this.armorVal)
      this.armorVal.innerText = `${Math.floor(player.armor)} / ${player.maxArmor}`;

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
