import { COMMODITIES } from "../net/SchemaRegistry.js";

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
    // Previous-frame shield, tracked separately so a hit is classified as a
    // shield vs armor hit by the actual per-pool delta (not the combined total).
    this._lastShield = null;
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

    // Bounty Locator Radar elements
    this.bountyRadar = document.getElementById("bounty-radar");
    this.bountyRadarTarget = document.getElementById("bounty-radar-target");
    this.bountyRadarTelemetry = document.getElementById(
      "bounty-radar-telemetry",
    );

    // Dynamic Galaxy Event Ticker Banner elements (SPEC-057)
    this.eventTicker = document.getElementById("galaxy-event-ticker");
    this.eventTitle = document.getElementById("galaxy-event-title");
    this.eventDesc = document.getElementById("galaxy-event-desc");
    this.eventTimer = document.getElementById("galaxy-event-timer");

    // Squad / Co-op Party Management Panel (SPEC-059)
    this.squadPanel = document.getElementById("squad-panel");
    this.squadMembersList = document.getElementById("squad-members-list");

    // Wingman Telemetry Panel (SPEC-079)
    this.wingmanPanel = document.getElementById("wingman-panel");
    this.wingmanList = document.getElementById("wingman-list");

    // Trade Route Advisor Panel (SPEC-082)
    this.tradeAdvisorPanel = document.getElementById("trade-advisor-panel");
    this.tradeRoutesList = document.getElementById("trade-routes-list");

    // NAV-Computer Slide-Out Panel (SPEC-088)
    this.navComputerPanel = document.getElementById("nav-computer-panel");
    this.navComputerDest = document.getElementById("nav-computer-dest");
    this.navComputerStatus = document.getElementById("nav-computer-status");
    this.navComputerProgress = document.getElementById("nav-computer-progress");
    this.navComputerRoute = document.getElementById("nav-computer-route");
  }

  /**
   * Updates or hides the dynamic galaxy economic event ticker banner.
   * @param {Object|null} event - The active galaxy event or null.
   */
  updateGalaxyEvent(event) {
    if (!this.eventTicker) return;
    if (!event) {
      this.eventTicker.style.display = "none";
      return;
    }
    this.eventTicker.style.display = "block";
    if (this.eventTitle) {
      this.eventTitle.textContent = `GALAXY EVENT: ${event.name.toUpperCase()}`;
    }
    if (this.eventDesc) {
      let modifierStrings = [];
      if (event.priceModifiers) {
        for (const [commodity, val] of Object.entries(event.priceModifiers)) {
          modifierStrings.push(`${commodity.toUpperCase()} ${val}x`);
        }
      }
      const modifiersDesc =
        modifierStrings.length > 0 ? ` (${modifierStrings.join(", ")})` : "";
      this.eventDesc.textContent = `${event.description}${modifiersDesc}`;
    }
    if (this.eventTimer) {
      const remainingSecs = Math.max(0, Math.ceil(event.duration));
      this.eventTimer.textContent = `TIME REMAINING: ${remainingSecs}s`;
    }
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
   * @param {Array} [activeMissions] - Active missions list for bounty tracking.
   * @param {string} [navTargetSector] - Target sector name.
   * @param {Array} [navRoute] - Remaining jump path.
   */
  update(
    player,
    target,
    planets,
    nebulae = [],
    entities = [],
    activeMissions = [],
    navTargetSector = null,
    navRoute = [],
  ) {
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

    // 6. Update Bounty Locator Radar overlay
    const hasRadar =
      player.outfits && player.outfits.includes("Bounty Locator Radar");
    if (!hasRadar) {
      if (this.bountyRadar) {
        this.bountyRadar.style.display = "none";
        this.bountyRadar.classList.remove("visible");
      }
    } else {
      if (this.bountyRadar) {
        this.bountyRadar.style.display = "block";
        this.bountyRadar.classList.add("visible");
      }

      // Collect names of target bosses from active bounty/storyline missions
      const activeBountyNames = [];
      if (Array.isArray(activeMissions)) {
        for (const m of activeMissions) {
          if ((m.type === "bounty" || m.type === "storyline") && m.targetName) {
            activeBountyNames.push(m.targetName);
          }
        }
      }

      // Find target boss or matching targetName entity in sector
      let bountyTarget = null;
      if (Array.isArray(entities)) {
        for (const ent of entities) {
          if (ent.type === "ship" && !ent.isDestroyed) {
            if (ent.role === "boss" || activeBountyNames.includes(ent.name)) {
              bountyTarget = ent;
              break;
            }
          }
        }
      }

      if (bountyTarget) {
        const dx = bountyTarget.position.x - player.position.x;
        const dy = bountyTarget.position.y - player.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // North is 0°, East is 90°, South is 180°, West is 270° (-Y is North)
        const compassHeading =
          ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;

        // Relative angle to the ship nose
        const angleRad = Math.atan2(dy, dx);
        let relativeAngleRad = angleRad - (player.heading || 0);
        relativeAngleRad = Math.atan2(
          Math.sin(relativeAngleRad),
          Math.cos(relativeAngleRad),
        );
        const relativeAngleDeg = relativeAngleRad * (180 / Math.PI);

        if (this.bountyRadarTarget) {
          this.bountyRadarTarget.innerText =
            bountyTarget.name || "WANTED TARGET";
        }
        if (this.bountyRadarTelemetry) {
          this.bountyRadarTelemetry.innerHTML = `
            <span style="display: inline-block; font-size: 14px; font-weight: bold; color: var(--color-cyan); margin-right: 8px; transform: rotate(${relativeAngleDeg.toFixed(1)}deg); transition: transform 0.05s ease-out;">▲</span>
            RANGE: <strong>${Math.round(distance).toLocaleString()} u</strong> | HDG: <strong>${Math.round(compassHeading)}°</strong>
          `;
        }
      } else {
        if (this.bountyRadarTarget) {
          this.bountyRadarTarget.innerText = "NO TARGET DETECTED";
        }
        if (this.bountyRadarTelemetry) {
          this.bountyRadarTelemetry.innerHTML = `No Active Bounty Targets in Sector`;
        }
      }
    }

    // 7. Update Squad HUD overlay (SPEC-059)
    if (this.squadPanel) {
      const squad = player.squad || [];
      if (squad.length === 0) {
        this.squadPanel.style.display = "none";
      } else {
        this.squadPanel.style.display = "block";
        if (this.squadMembersList) {
          this.squadMembersList.innerHTML = "";
          for (const member of squad) {
            const memberCard = document.createElement("div");
            memberCard.className = "fleet-member-card";

            const shieldRatio = Math.max(
              0,
              Math.min(100, (member.shield / member.maxShield) * 100),
            );
            const armorRatio = Math.max(
              0,
              Math.min(100, (member.armor / member.maxArmor) * 100),
            );

            const targetText = member.targetName
              ? `TARGET: ${member.targetName}`
              : "NO TARGET";
            const posText = `X: ${Math.round(member.x)}, Y: ${Math.round(member.y)}`;

            memberCard.innerHTML = `
              <div class="fleet-member-header">
                <span class="fleet-member-name" style="color: #00f2fe; text-shadow: 0 0 4px rgba(0, 242, 254, 0.4);">${member.nickname}</span>
                <span class="fleet-member-status" style="font-size: 8px;">${posText}</span>
              </div>
              <div class="fleet-bars-container">
                <div class="fleet-bar-row">
                  <span class="fleet-bar-label">SHIELD</span>
                  <div class="fleet-mini-bar">
                    <div class="fleet-mini-bar-fill" style="width: ${shieldRatio}%; background: #00f2fe; box-shadow: 0 0 4px #00f2fe;"></div>
                  </div>
                </div>
                <div class="fleet-bar-row">
                  <span class="fleet-bar-label">ARMOR</span>
                  <div class="fleet-mini-bar">
                    <div class="fleet-mini-bar-fill" style="width: ${armorRatio}%; background: #ff3b30;"></div>
                  </div>
                </div>
                <div style="font-size: 8px; color: var(--color-text-secondary); margin-top: 2px; font-family: var(--font-display);">
                  ${targetText}
                </div>
              </div>
            `;
            this.squadMembersList.appendChild(memberCard);
          }
        }
      }
    }

    // 8. Update Wingman Telemetry HUD (SPEC-079)
    if (this.wingmanPanel) {
      // Find active wingmen (role is "escort" and flagshipId matches player.id)
      const wingmen = entities.filter(
        (ent) =>
          ent &&
          !ent.isDestroyed &&
          (ent.role === "escort" ||
            (ent.type === "ship" && ent.role === "escort")) &&
          (ent.flagshipId === player.id || ent["flagshipId"] === player.id),
      );

      if (wingmen.length === 0) {
        this.wingmanPanel.style.display = "none";
      } else {
        this.wingmanPanel.style.display = "block";
        if (this.wingmanList) {
          this.wingmanList.innerHTML = "";
          for (const wm of wingmen) {
            const card = document.createElement("div");
            card.className = "fleet-member-card wingman-card";

            const shieldRatio = Math.max(
              0,
              Math.min(100, ((wm.shield || 0) / (wm.maxShield || 1)) * 100),
            );
            const armorRatio = Math.max(
              0,
              Math.min(100, ((wm.armor || 0) / (wm.maxArmor || 1)) * 100),
            );

            // Get target information
            let targetText = "NO TARGET";
            if (wm.target) {
              targetText = `TARGET: ${wm.target.name || wm.target.type || "UNKNOWN"}`;
            } else if (wm.targetId) {
              const locked = entities.find((e) => e.id === wm.targetId);
              targetText = locked
                ? `TARGET: ${locked.name || locked.type || "UNKNOWN"}`
                : `TARGET: [ID ${wm.targetId}]`;
            }

            card.innerHTML = `
              <div class="fleet-member-header">
                <span class="fleet-member-name" style="color: var(--color-gold); text-shadow: 0 0 4px rgba(212, 175, 55, 0.4);">${wm.name || "Wingman Escort"}</span>
                <span class="fleet-member-status" style="font-size: 8px; color: #a0a5b5;">ACTIVE ESCORT</span>
              </div>
              <div class="fleet-bars-container">
                <div class="fleet-bar-row">
                  <span class="fleet-bar-label">SHIELD</span>
                  <div class="fleet-mini-bar">
                    <div class="fleet-mini-bar-fill" style="width: ${shieldRatio}%; background: #00f2fe; box-shadow: 0 0 4px #00f2fe;"></div>
                  </div>
                </div>
                <div class="fleet-bar-row">
                  <span class="fleet-bar-label">ARMOR</span>
                  <div class="fleet-mini-bar">
                    <div class="fleet-mini-bar-fill" style="width: ${armorRatio}%; background: #ff3b30;"></div>
                  </div>
                </div>
                <div class="wingman-target" style="font-size: 8px; color: var(--color-gold); margin-top: 2px; font-family: var(--font-display); text-transform: uppercase;">
                  ${targetText}
                </div>
              </div>
            `;
            this.wingmanList.appendChild(card);
          }
        }
      }
    }

    // 9. Update Trade Advisor HUD (SPEC-082)
    if (this.tradeAdvisorPanel && this.tradeRoutesList) {
      if (!planets || planets.length < 2) {
        this.tradeRoutesList.innerHTML = `
          <div style="color: rgba(255, 255, 255, 0.5); font-style: italic; font-size: 0.9em; text-align: center; padding: 4px 0;">No sector planets available</div>
        `;
      } else {
        const getStanding = (faction) => {
          if (!faction || !player.standings) return 0;
          return player.standings[faction] || 0;
        };

        const getTaxRate = (faction) => {
          if (!faction || faction === "Independents") return 0.0;
          const standing = getStanding(faction);
          if (standing >= 50) return 0.0;
          if (standing <= -16) return 0.15;
          return 0.05;
        };

        const getFactionPrice = (basePrice, faction, mode) => {
          if (!faction || faction === "Independents") return basePrice;
          const standing = getStanding(faction);
          const t = Math.max(-1, Math.min(1, standing / 100));
          const modifier = mode === "sell" ? 1 + t * 0.2 : 1 - t * 0.2;
          return Math.max(1, Math.round(basePrice * modifier));
        };

        const routes = [];
        const commodities = COMMODITIES;

        for (let i = 0; i < planets.length; i++) {
          const pA = planets[i];
          for (let j = 0; j < planets.length; j++) {
            if (i === j) continue;
            const pB = planets[j];

            for (const commodity of commodities) {
              let baseBuyPrice = pA.market[commodity];
              let baseSellPrice = pB.market[commodity];
              if (baseBuyPrice === undefined || baseSellPrice === undefined)
                continue;

              // Black market premium for contraband
              if (
                commodity === "contraband" &&
                pB.services &&
                pB.services.blackMarket
              ) {
                baseSellPrice = Math.round(baseSellPrice * 1.5);
              }

              const buyPrice = getFactionPrice(baseBuyPrice, pA.faction, "buy");
              const sellPrice = getFactionPrice(
                baseSellPrice,
                pB.faction,
                "sell",
              );
              const taxRate = getTaxRate(pB.faction);
              const netSellPrice = Math.max(
                1,
                Math.round(sellPrice * (1 - taxRate)),
              );

              const netProfit = netSellPrice - buyPrice;
              if (netProfit > 0) {
                routes.push({
                  commodity,
                  origin: pA.name,
                  destination: pB.name,
                  buyPrice,
                  sellPrice: netSellPrice,
                  netProfit,
                });
              }
            }
          }
        }

        routes.sort((a, b) => b.netProfit - a.netProfit);
        const topRoutes = routes.slice(0, 3);

        if (topRoutes.length === 0) {
          this.tradeRoutesList.innerHTML = `
            <div style="color: rgba(255, 255, 255, 0.5); font-style: italic; font-size: 0.9em; text-align: center; padding: 4px 0;">No profitable routes in sector</div>
          `;
        } else {
          this.tradeRoutesList.innerHTML = "";
          for (const route of topRoutes) {
            const row = document.createElement("div");
            row.style.background = "rgba(212, 175, 55, 0.05)";
            row.style.border = "1px solid rgba(212, 175, 55, 0.2)";
            row.style.borderRadius = "4px";
            row.style.padding = "6px 8px";
            row.style.display = "flex";
            row.style.flexDirection = "column";
            row.style.gap = "2px";

            row.innerHTML = `
              <div style="display: flex; justify-content: space-between; font-weight: bold; color: #ffffff;">
                <span class="capitalize" style="color: var(--color-gold);">${route.commodity}</span>
                <span style="color: var(--color-green);">+${route.netProfit} CR/t</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.9em; color: rgba(255,255,255,0.7);">
                <span>${route.origin} (${route.buyPrice} CR)</span>
                <span>▶</span>
                <span>${route.destination} (${route.sellPrice} CR)</span>
              </div>
            `;
            this.tradeRoutesList.appendChild(row);
          }
        }
      }
    }

    // 10. Update NAV-computer Slide-out Panel (SPEC-088)
    if (this.navComputerPanel) {
      const targetSector = navTargetSector || this.navTargetSector;
      const route = navRoute || this.navRoute || [];

      if (targetSector) {
        this.navComputerPanel.classList.remove("hidden");
        if (this.navComputerDest) {
          this.navComputerDest.innerText = targetSector.toUpperCase();
        }

        let statusText = "EN ROUTE";
        let progressPct;

        if (route.length === 0) {
          statusText = "ARRIVED";
          progressPct = 100;
        } else {
          const totalJumps = 2; // Maximum hops in sector layout
          const completed = Math.max(0, totalJumps - route.length);
          progressPct = Math.round((completed / totalJumps) * 100);
        }

        if (this.navComputerStatus) {
          this.navComputerStatus.innerText = statusText;
          if (statusText === "ARRIVED") {
            this.navComputerStatus.style.color = "var(--color-green)";
          } else {
            this.navComputerStatus.style.color = "#ffb300";
          }
        }

        if (this.navComputerProgress) {
          this.navComputerProgress.style.width = `${progressPct}%`;
        }

        if (this.navComputerRoute) {
          if (route.length === 0) {
            this.navComputerRoute.innerHTML = `
              <div style="color: var(--color-green); font-weight: bold; text-align: center;">DESTINATION ARRIVED!</div>
            `;
          } else {
            const getSectorFromPosition = (pos) => {
              if (!pos) return "core";
              if (pos.x > 10000 && pos.y > 10000) return "frontier";
              if (pos.x < -10000 && pos.y < -10000) return "rim";
              return "core";
            };
            const currentSectorName = getSectorFromPosition(player.position);
            let pathHtml = `<span style="color: #ffb300;">[${currentSectorName.toUpperCase()}]</span>`;
            for (let i = 0; i < route.length; i++) {
              pathHtml += ` ➔ <span style="color: #ffffff;">${route[i].toUpperCase()}</span>`;
            }
            this.navComputerRoute.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: bold; margin-bottom: 2px;">PATH PLOTTED:</div>
                <div style="font-size: 10px; line-height: 1.5;">${pathHtml}</div>
                <div style="font-size: 8px; color: rgba(255, 179, 0, 0.6); margin-top: 4px; font-style: italic;">
                  Immediate Jump: TO ${route[0].toUpperCase()}
                </div>
              </div>
            `;
          }
        }
      } else {
        this.navComputerPanel.classList.add("hidden");
      }
    }

    // Update Territory Control HUD Card
    this.updateTerritoryControl(player);
  }

  /**
   * Refreshes the territory control overlay and HUD panel cards (SPEC-098).
   * @param {Ship} player
   */
  updateTerritoryControl(player) {
    if (!this.territoryControlPanel) {
      // Lazy load elements if they aren't bound in the constructor
      this.territoryControlPanel = document.getElementById(
        "territory-control-panel",
      );
      this.currentSectorOwner = document.getElementById("current-sector-owner");
      this.currentSectorSecurity = document.getElementById(
        "current-sector-security",
      );
      this.currentSectorTax = document.getElementById("current-sector-tax");
      this.influenceBars = document.getElementById("influence-bars");
    }

    if (!this.territoryControlPanel) return;

    // Determine current sector from player position
    const getSectorFromPosition = (pos) => {
      if (!pos) return "core";
      if (pos.x > 10000 && pos.y > 10000) return "frontier";
      if (pos.x < -10000 && pos.y < -10000) return "rim";
      return "core";
    };

    const currentSector = getSectorFromPosition(player.position);

    // Retrieve sector control data from NetworkHandler / window
    const sectors = window.networkHandler
      ? window.networkHandler.sectors
      : null;
    if (!sectors || !sectors[currentSector]) {
      this.territoryControlPanel.style.display = "none";
      return;
    }

    this.territoryControlPanel.style.display = "block";
    const sectorData = sectors[currentSector];
    const owner = sectorData.controllingFaction;

    // Get security, tax based on owner
    let security = "medium";
    let taxRate = "8%";
    let factionColor = "var(--color-gold)"; // Default Frontier League

    if (owner === "Federation") {
      security = "HIGH";
      taxRate = "12%";
      factionColor = "var(--color-cyan)";
    } else if (owner === "Frontier League") {
      security = "MEDIUM";
      taxRate = "8%";
      factionColor = "var(--color-gold)";
    } else if (owner === "Pirates") {
      security = "LAWLESS";
      taxRate = "20%";
      factionColor = "#ff3b30"; // Red
    } else if (owner === "Independents") {
      security = "LOW";
      taxRate = "5%";
      factionColor = "#a0a5b5"; // Muted Gray
    }

    if (this.currentSectorOwner) {
      this.currentSectorOwner.innerText = owner.toUpperCase();
      this.currentSectorOwner.style.color = factionColor;
    }
    if (this.currentSectorSecurity) {
      this.currentSectorSecurity.innerText = security;
      this.currentSectorSecurity.style.color = factionColor;
    }
    if (this.currentSectorTax) {
      this.currentSectorTax.innerText = taxRate;
      this.currentSectorTax.style.color = factionColor;
    }

    if (this.influenceBars) {
      this.influenceBars.innerHTML = "";
      for (const [faction, score] of Object.entries(sectorData.influence)) {
        let fColor = "#a0a5b5";
        if (faction === "Federation") fColor = "var(--color-cyan)";
        else if (faction === "Frontier League") fColor = "var(--color-gold)";
        else if (faction === "Pirates") fColor = "#ff3b30";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.flexDirection = "column";
        row.style.gap = "2px";
        row.style.fontSize = "0.75em";

        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; color: rgba(255,255,255,0.7);">
            <span>${faction.toUpperCase()}</span>
            <span>${Math.round(score)}%</span>
          </div>
          <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
            <div style="width: ${score}%; height: 100%; background: ${fColor}; box-shadow: 0 0 4px ${fColor}; transition: width 0.3s ease-out;"></div>
          </div>
        `;
        this.influenceBars.appendChild(row);
      }
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
      // Classify off the actual shield delta: if shield itself dropped it is a
      // shield hit (blue), otherwise armor absorbed it (red). `_lastShield` is
      // non-null here because the hit branch requires a prior frame.
      const shieldDropped = (player.shield || 0) < this._lastShield - 0.5;
      this._hitFlashTimerMs = 320;
      this._hitFlashKind = shieldDropped ? "shield" : "armor";
      // Combat lockout matches the engine's shieldRegenDelay (default 3s).
      this._shieldLockoutMs = (player.shieldRegenDelay || 3) * 1000;
    }
    this._lastShieldTotal = currentTotal;
    this._lastShield = player.shield || 0;

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
