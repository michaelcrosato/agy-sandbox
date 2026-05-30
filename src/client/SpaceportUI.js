import { applyRefine, refineCost } from "../engine/PortServices.js";

/**
 * Manages the interactive glassmorphic spaceport menu, handling trading, ship upgrades, and purchases.
 */
export class SpaceportUI {
  /**
   * Creates a SpaceportUI manager.
   * @param {UIController} uiController - HUD controller for notification triggers.
   * @param {MissionManager} missionManager - Procedural mission controller.
   */
  constructor(uiController, missionManager) {
    this.ui = uiController;
    this.missionManager = missionManager;

    // Cache Spaceport panel views
    this.overlay = document.getElementById("spaceport-overlay");
    this.title = document.getElementById("spaceport-title");
    this.desc = document.getElementById("spaceport-description");

    this.tabTrade = document.getElementById("tab-trade");
    this.tabMissions = document.getElementById("tab-missions");
    this.tabOutfitter = document.getElementById("tab-outfitter");
    this.tabShipyard = document.getElementById("tab-shipyard");
    this.tabRefinery = document.getElementById("tab-refinery");

    this.paneTrade = document.getElementById("pane-trade");
    this.paneMissions = document.getElementById("pane-missions");
    this.paneOutfitter = document.getElementById("pane-outfitter");
    this.paneShipyard = document.getElementById("pane-shipyard");
    this.paneRefinery = document.getElementById("pane-refinery");

    this.btnLaunch = document.getElementById("btn-launch");

    this.player = null;
    this.planet = null;
    this.allPlanets = [];
    this.onLaunch = null;

    this.setupListeners();
  }

  /**
   * Binds panel action tabs and launch controls.
   */
  setupListeners() {
    this.tabTrade?.addEventListener("click", () => this.switchTab("trade"));
    this.tabMissions?.addEventListener("click", () =>
      this.switchTab("missions"),
    );
    this.tabOutfitter?.addEventListener("click", () =>
      this.switchTab("outfitter"),
    );
    this.tabShipyard?.addEventListener("click", () =>
      this.switchTab("shipyard"),
    );
    this.tabRefinery?.addEventListener("click", () =>
      this.switchTab("refinery"),
    );

    this.btnLaunch?.addEventListener("click", () => {
      if (window.network) {
        if (window.network.connected) {
          window.network.requestLaunch();
        } else {
          this.ui.notify("Neural link offline! Cannot launch ship.", "error");
        }
        return;
      }
      this.close();
      if (this.onLaunch) this.onLaunch();
    });
  }

  switchTab(pane) {
    // Reset active indicators
    this.tabTrade?.classList.remove("active");
    this.tabMissions?.classList.remove("active");
    this.tabOutfitter?.classList.remove("active");
    this.tabShipyard?.classList.remove("active");
    this.tabRefinery?.classList.remove("active");

    this.paneTrade?.classList.remove("active");
    this.paneMissions?.classList.remove("active");
    this.paneOutfitter?.classList.remove("active");
    this.paneShipyard?.classList.remove("active");
    this.paneRefinery?.classList.remove("active");

    if (pane === "trade") {
      this.tabTrade?.classList.add("active");
      this.paneTrade?.classList.add("active");
      this.renderTrade();
    } else if (pane === "missions") {
      this.tabMissions?.classList.add("active");
      this.paneMissions?.classList.add("active");
      this.renderMissions();
    } else if (pane === "outfitter") {
      this.tabOutfitter?.classList.add("active");
      this.paneOutfitter?.classList.add("active");
      this.renderOutfitter();
    } else if (pane === "shipyard") {
      this.tabShipyard?.classList.add("active");
      this.paneShipyard?.classList.add("active");
      this.renderShipyard();
    } else if (pane === "refinery") {
      this.tabRefinery?.classList.add("active");
      this.paneRefinery?.classList.add("active");
      this.renderRefinery();
    }
  }

  open(player, planet, allPlanets = []) {
    this.player = player;
    this.planet = planet;
    this.allPlanets = allPlanets;

    if (this.overlay) {
      this.overlay.classList.add("visible");
    }

    if (this.title) this.title.innerText = planet.name.toUpperCase();
    if (this.desc) this.desc.innerText = planet.description;

    // Show/hide refinery services tab based on planet configuration
    if (this.tabRefinery) {
      if (planet.services && planet.services.refinery) {
        this.tabRefinery.style.display = "block";
      } else {
        this.tabRefinery.style.display = "none";
      }
    }

    // Default to Trade Commodities pane
    this.switchTab("trade");
  }

  /**
   * Hides the spaceport window.
   */
  close() {
    if (this.overlay) {
      this.overlay.classList.remove("visible");
    }
  }

  /**
   * Renders the cargo trading grids.
   */
  renderTrade() {
    if (!this.paneTrade || !this.player || !this.planet) return;

    this.paneTrade.innerHTML = "";

    const commodities = Object.keys(this.planet.market);

    const table = document.createElement("table");
    table.className = "trade-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>COMMODITY</th>
          <th>PRICE</th>
          <th>PLAYER CARGO</th>
          <th>ACTION</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    // Client baseline market index for comparison and neon HUD highlights
    const baseMarkets = {
      Sol: {
        food: 100,
        electronics: 300,
        minerals: 150,
        luxuries: 600,
        contraband: 250,
        machinery: 100,
      },
      "New Polaris": {
        food: 220,
        electronics: 320,
        minerals: 50,
        luxuries: 650,
        contraband: 300,
        machinery: 220,
      },
      "Sigma Draconis": {
        food: 120,
        electronics: 120,
        minerals: 250,
        luxuries: 500,
        contraband: 200,
        machinery: 160,
      },
      "Kaelis Colony": {
        food: 40,
        electronics: 420,
        minerals: 180,
        luxuries: 550,
        contraband: 280,
        machinery: 190,
      },
      "Aurelia Mining Hub": {
        food: 150,
        electronics: 290,
        minerals: 70,
        luxuries: 580,
        contraband: 260,
        machinery: 150,
      },
      "Tenebris Prime": {
        food: 160,
        electronics: 450,
        minerals: 200,
        luxuries: 220,
        contraband: 400,
        machinery: 240,
      },
      "Valkyrie Depot": {
        food: 110,
        electronics: 380,
        minerals: 190,
        luxuries: 520,
        contraband: 220,
        machinery: 80,
      },
      "Rogue's Hollow": {
        food: 250,
        electronics: 220,
        minerals: 160,
        luxuries: 450,
        contraband: 60,
        machinery: 180,
      },
    };

    for (const item of commodities) {
      const price = this.planet.market[item];
      const playerQty = this.player.cargo[item] || 0;

      const basePrices = baseMarkets[this.planet.name] || {};
      const baseline = basePrices[item] || 150;

      let priceClass = "";
      let trendIcon = "";
      if (price > baseline) {
        priceClass = "trade-price-high";
        trendIcon = ' <span class="trend-high">▲</span>';
      } else if (price < baseline) {
        priceClass = "trade-price-low";
        trendIcon = ' <span class="trend-low">▼</span>';
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="capitalize">${item}</td>
        <td class="${priceClass}">${price} CR${trendIcon}</td>
        <td id="qty-${item}">${playerQty} t</td>
        <td>
          <button class="btn-sm btn-trade-buy" data-item="${item}">BUY</button>
          <button class="btn-sm btn-trade-sell" data-item="${item}">SELL</button>
        </td>
      `;

      // Buy Trigger
      tr.querySelector(".btn-trade-buy").addEventListener("click", () => {
        if (window.network) {
          if (window.network.connected) {
            window.network.requestTrade(item, "buy");
          } else {
            this.ui.notify(
              "Neural link offline! Cannot perform transactions.",
              "error",
            );
          }
          return;
        }

        if (this.player.credits < price) {
          this.ui.notify("Insufficient credits!", "error");
          return;
        }
        if (this.player.addCargo(item, 1)) {
          this.player.credits -= price;
          this.ui.notify(
            `Purchased 1 ton of ${item} for ${price} CR`,
            "success",
          );
          this.refreshUI();
          this.renderTrade();
        } else {
          this.ui.notify("Cargo hold is full!", "error");
        }
      });

      // Sell Trigger
      tr.querySelector(".btn-trade-sell").addEventListener("click", () => {
        if (window.network) {
          if (window.network.connected) {
            window.network.requestTrade(item, "sell");
          } else {
            this.ui.notify(
              "Neural link offline! Cannot perform transactions.",
              "error",
            );
          }
          return;
        }

        if (this.player.removeCargo(item, 1)) {
          this.player.credits += price;
          this.ui.notify(`Sold 1 ton of ${item} for ${price} CR`, "success");
          this.refreshUI();
          this.renderTrade();
        } else {
          this.ui.notify(`No ${item} in cargo bay!`, "error");
        }
      });

      tbody.appendChild(tr);
    }

    this.paneTrade.appendChild(table);
  }

  /**
   * Renders the outfitter shop panel.
   */
  renderOutfitter() {
    if (!this.paneOutfitter || !this.player || !this.planet) return;

    this.paneOutfitter.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "outfitter-grid";

    for (const outfit of this.planet.outfitter) {
      const card = document.createElement("div");
      card.className = "outfit-card";

      const hasOutfit = this.player.outfits.includes(outfit.name);
      const descText =
        outfit.description ||
        `High-performance ${outfit.type} module. Restores or boosts ship parameters by +${outfit.value}.`;

      card.innerHTML = `
        <h3>${outfit.name}</h3>
        <p class="outfit-desc" style="font-size: 11px; color: #a0a5b5; margin-bottom: 8px; line-height: 1.4;">${descText}</p>
        <p>Type: <span class="capitalize">${outfit.type}</span></p>
        <p class="cost">${outfit.cost.toLocaleString()} CR</p>
        <button class="btn-block" ${hasOutfit ? "disabled" : ""}>
          ${hasOutfit ? "EQUIPPED" : "PURCHASE"}
        </button>
      `;

      card.querySelector("button").addEventListener("click", () => {
        if (window.network) {
          if (window.network.connected) {
            window.network.requestOutfitPurchase(outfit.name);
          } else {
            this.ui.notify(
              "Neural link offline! Cannot upgrade ship.",
              "error",
            );
          }
          return;
        }

        if (this.player.credits < outfit.cost) {
          this.ui.notify("Insufficient credits for upgrade!", "error");
          return;
        }

        this.player.credits -= outfit.cost;
        this.player.outfits.push(outfit.name);

        // Apply stat improvements directly based on outfitter details
        if (outfit.type === "shield") {
          this.player.maxShield += outfit.value;
          this.player.shield = this.player.maxShield;
        } else if (outfit.type === "engine") {
          this.player.thrustPower += outfit.value;
          this.player.maxSpeed += 50;
        } else if (outfit.type === "weapon") {
          this.player.weaponDamage += outfit.value;
        } else if (outfit.type === "cargo") {
          this.player.cargoCapacity += outfit.value;
        } else if (outfit.type === "reactor") {
          this.player.energyRegen += outfit.value;
        } else if (outfit.type === "radiator") {
          this.player.heatDissipation += outfit.value;
        } else if (outfit.type === "capacitor") {
          this.player.maxEnergy += outfit.value;
          this.player.energy = this.player.maxEnergy;
        }

        this.ui.notify(`Equipped: ${outfit.name}!`, "success");
        this.refreshUI();
        this.renderOutfitter();
      });

      grid.appendChild(card);
    }

    this.paneOutfitter.appendChild(grid);
  }

  /**
   * Renders the Shipyard trading overlay.
   */
  renderShipyard() {
    if (!this.paneShipyard || !this.player || !this.planet) return;

    this.paneShipyard.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "shipyard-grid";

    for (const s of this.planet.shipyard) {
      const card = document.createElement("div");
      card.className = "ship-card";

      const isCurrent = this.player.name === s.name;
      const descText =
        s.description ||
        `Sleek ${s.name} class chassis optimized for interstellar operations.`;

      card.innerHTML = `
        <h3>${s.name}</h3>
        <p class="ship-desc" style="font-size: 11px; color: #a0a5b5; margin-bottom: 8px; line-height: 1.4;">${descText}</p>
        <div class="ship-stats">
          <div>Shields: ${s.maxShield}</div>
          <div>Armor: ${s.maxArmor}</div>
          <div>Cargo: ${s.cargoCapacity} t</div>
          <div>Thrust: ${s.thrustPower}N</div>
        </div>
        <p class="cost">${s.cost.toLocaleString()} CR</p>
        <button class="btn-block" ${isCurrent ? "disabled" : ""}>
          ${isCurrent ? "ACTIVE OWNED" : "TRADE-IN & BUY"}
        </button>
      `;

      card.querySelector("button").addEventListener("click", () => {
        if (window.network) {
          if (window.network.connected) {
            window.network.requestShipPurchase(s.name);
          } else {
            this.ui.notify(
              "Neural link offline! Shipyard services unavailable.",
              "error",
            );
          }
          return;
        }

        if (this.player.credits < s.cost) {
          this.ui.notify("Insufficient credits for ship purchase!", "error");
          return;
        }

        // Standard transaction
        this.player.credits -= s.cost;
        this.player.name = s.name;

        // Overwrite player ship physical statistics
        this.player.maxShield = s.maxShield;
        this.player.shield = s.maxShield;
        this.player.maxArmor = s.maxArmor;
        this.player.armor = s.maxArmor;
        this.player.cargoCapacity = s.cargoCapacity;
        this.player.thrustPower = s.thrustPower;
        this.player.turnRate = s.turnRate;

        // Reset cargo holding bay
        this.player.cargo = {
          food: 0,
          electronics: 0,
          minerals: 0,
          luxuries: 0,
          contraband: 0,
          machinery: 0,
        };

        this.ui.notify(`Acquired new ship: ${s.name}!`, "success");
        this.refreshUI();
        this.renderShipyard();
      });

      grid.appendChild(card);
    }

    this.paneShipyard.appendChild(grid);
  }

  /**
   * Renders the interactive procedural Mission Board panel.
   */
  renderMissions() {
    if (
      !this.paneMissions ||
      !this.player ||
      !this.planet ||
      !this.missionManager
    )
      return;

    this.paneMissions.innerHTML = "";

    const container = document.createElement("div");
    container.className = "pane-missions-container";

    // Generate available missions dynamically if none exists for this planet yet (and we are offline)
    const isOnline = window.network && window.network.connected;
    if (!isOnline && !this.missionManager.availableMissions[this.planet.name]) {
      this.missionManager.generateMissionsForPlanet(
        this.planet.name,
        this.allPlanets,
      );
    }
    const available =
      this.missionManager.availableMissions[this.planet.name] || [];

    // --- Available Contracts ---
    const availableSection = document.createElement("div");
    availableSection.innerHTML = `<h3 class="mission-section-title">AVAILABLE CONTRACTS</h3>`;
    const availableGrid = document.createElement("div");
    availableGrid.className = "mission-grid";

    if (available.length === 0) {
      availableGrid.innerHTML = `<div class="empty-tracker">No contracts available at this port</div>`;
    } else {
      for (const m of available) {
        const card = document.createElement("div");
        card.className = "mission-card";

        let badgeClass = "badge-courier";
        if (m.type === "smuggle") badgeClass = "badge-smuggle";
        if (m.type === "bounty") badgeClass = "badge-bounty";
        if (m.type === "storyline") badgeClass = "badge-storyline";

        card.innerHTML = `
          <div class="mission-info">
            <div class="mission-header">
              <span class="badge ${badgeClass}">${m.type}</span>
              <span class="mission-title">${m.title}</span>
            </div>
            <p class="mission-desc">${m.description}</p>
          </div>
          <div class="mission-reward">${m.reward.toLocaleString()} CR</div>
          <div class="mission-actions">
            <button class="btn-sm btn-trade-buy accept-mission-btn" data-id="${m.id}">ACCEPT</button>
          </div>
        `;

        card
          .querySelector(".accept-mission-btn")
          .addEventListener("click", () => {
            if (window.network) {
              if (window.network.connected) {
                window.network.requestMissionAccept(this.planet.name, m.id);
              } else {
                this.ui.notify(
                  "Neural link offline! Cannot accept contracts.",
                  "error",
                );
              }
              return;
            }

            const res = this.missionManager.acceptMission(
              this.planet.name,
              m.id,
              this.player,
            );
            if (res.success) {
              this.ui.notify(res.message, "success");
              this.refreshUI();
              this.renderMissions();
            } else {
              this.ui.notify(res.message, "error");
            }
          });

        availableGrid.appendChild(card);
      }
    }
    availableSection.appendChild(availableGrid);
    container.appendChild(availableSection);

    // --- Active Contracts ---
    const activeSection = document.createElement("div");
    activeSection.innerHTML = `<h3 class="mission-section-title">ACTIVE CONTRACTS</h3>`;
    const activeGrid = document.createElement("div");
    activeGrid.className = "mission-grid";

    const active = this.missionManager.activeMissions || [];
    if (active.length === 0) {
      activeGrid.innerHTML = `<div class="empty-tracker">No active contracts in progress</div>`;
    } else {
      for (const m of active) {
        const card = document.createElement("div");
        card.className = "mission-card";

        let badgeClass = "badge-courier";
        if (m.type === "smuggle") badgeClass = "badge-smuggle";
        if (m.type === "bounty") badgeClass = "badge-bounty";
        if (m.type === "storyline") badgeClass = "badge-storyline";

        card.innerHTML = `
          <div class="mission-info">
            <div class="mission-header">
              <span class="badge ${badgeClass}">${m.type}</span>
              <span class="mission-title">${m.title}</span>
            </div>
            <p class="mission-desc">${m.description}</p>
          </div>
          <div class="mission-reward">${m.reward.toLocaleString()} CR</div>
          <div class="mission-actions">
            <button class="btn-sm btn-trade-sell abandon-mission-btn" data-id="${m.id}">ABANDON</button>
          </div>
        `;

        card
          .querySelector(".abandon-mission-btn")
          .addEventListener("click", () => {
            if (window.network) {
              if (window.network.connected) {
                window.network.requestMissionAbandon(m.id);
              } else {
                this.ui.notify(
                  "Neural link offline! Cannot abandon contracts.",
                  "error",
                );
              }
              return;
            }

            this.missionManager.abandonMission(m.id, this.player);
            this.ui.notify(`Abandoned contract: ${m.title}`, "info");
            this.refreshUI();
            this.renderMissions();
          });

        activeGrid.appendChild(card);
      }
    }
    activeSection.appendChild(activeGrid);
    container.appendChild(activeSection);

    this.paneMissions.appendChild(container);
  }

  /**
   * Renders the interactive refinery panel.
   */
  renderRefinery() {
    if (!this.paneRefinery || !this.player || !this.planet) return;

    this.paneRefinery.innerHTML = "";

    const oreQty = (this.player.cargo && this.player.cargo.ore) || 0;
    const playerCredits = this.player.credits || 0;

    // Default target commodity state
    if (this._refineryTarget === undefined) {
      this._refineryTarget = "minerals";
    }
    const target = this._refineryTarget;
    const ratio = target === "minerals" ? 2 : 4;

    // Calculate maximum raw ore we can refine based on inventory and ratio constraints
    const maxRefine = Math.floor(oreQty / ratio) * ratio;

    // Initialize or clamp chosen quantity
    if (this._refineryQty === undefined || this._refineryQty > maxRefine) {
      this._refineryQty = maxRefine;
    }
    // Make sure it is at least 0, and a multiple of ratio
    if (this._refineryQty < 0) {
      this._refineryQty = 0;
    } else if (this._refineryQty > 0 && this._refineryQty % ratio !== 0) {
      this._refineryQty = Math.floor(this._refineryQty / ratio) * ratio;
    }

    const qty = this._refineryQty;
    const produced = qty / ratio;
    const baseFee = refineCost(qty, {}, null, null, null);

    // Build glassmorphic container layout
    const container = document.createElement("div");
    container.className = "refinery-container";
    container.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      padding: 15px;
      color: #e0e5f5;
      font-family: var(--font-body);
    `;

    // Left Column: Interactive Inputs
    const leftCol = document.createElement("div");
    leftCol.className = "refinery-inputs glass-panel";
    leftCol.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 15px;
      padding: 15px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    `;

    // Title
    const titleSec = document.createElement("div");
    titleSec.innerHTML = `
      <h3 style="font-family: var(--font-display); font-size: 14px; font-weight: 700; color: var(--color-cyan); margin: 0 0 5px 0;">REFINERY BAY</h3>
      <p style="font-size: 10px; color: #a0a5b5; margin: 0; line-height: 1.4;">
        Convert raw ore mined from asteroids into refined materials. Valkyrie Depot and major industrial planets provide high-efficiency refinery systems.
      </p>
    `;
    leftCol.appendChild(titleSec);

    // Target Selection Cards
    const targetLabel = document.createElement("label");
    targetLabel.innerText = "SELECT REFINED OUTPUT:";
    targetLabel.style.cssText =
      "font-size: 10px; font-weight: 600; color: var(--color-gold); letter-spacing: 1px;";
    leftCol.appendChild(targetLabel);

    const cardsContainer = document.createElement("div");
    cardsContainer.style.cssText =
      "display: grid; grid-template-columns: 1fr 1fr; gap: 10px;";

    // Minerals Card
    const mineralsCard = document.createElement("div");
    mineralsCard.className = `refinery-card ${target === "minerals" ? "active" : ""}`;
    mineralsCard.style.cssText = `
      padding: 12px;
      background: ${target === "minerals" ? "rgba(0, 242, 254, 0.1)" : "rgba(255, 255, 255, 0.02)"};
      border: 1px solid ${target === "minerals" ? "var(--color-cyan)" : "rgba(255, 255, 255, 0.08)"};
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    `;
    mineralsCard.innerHTML = `
      <div style="font-weight: 600; font-size: 12px; color: ${target === "minerals" ? "var(--color-cyan)" : "#e0e5f5"};">MINERALS</div>
      <div style="font-size: 9px; color: #a0a5b5; margin-top: 4px;">2:1 Ore Ratio</div>
    `;
    mineralsCard.addEventListener("click", () => {
      this._refineryTarget = "minerals";
      this._refineryQty = 0; // reset/clamp on target change
      this.renderRefinery();
    });
    cardsContainer.appendChild(mineralsCard);

    // Machinery Card
    const machineryCard = document.createElement("div");
    machineryCard.className = `refinery-card ${target === "machinery" ? "active" : ""}`;
    machineryCard.style.cssText = `
      padding: 12px;
      background: ${target === "machinery" ? "rgba(0, 242, 254, 0.1)" : "rgba(255, 255, 255, 0.02)"};
      border: 1px solid ${target === "machinery" ? "var(--color-cyan)" : "rgba(255, 255, 255, 0.08)"};
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    `;
    machineryCard.innerHTML = `
      <div style="font-weight: 600; font-size: 12px; color: ${target === "machinery" ? "var(--color-cyan)" : "#e0e5f5"};">MACHINERY</div>
      <div style="font-size: 9px; color: #a0a5b5; margin-top: 4px;">4:1 Ore Ratio</div>
    `;
    machineryCard.addEventListener("click", () => {
      this._refineryTarget = "machinery";
      this._refineryQty = 0; // reset/clamp on target change
      this.renderRefinery();
    });
    cardsContainer.appendChild(machineryCard);

    leftCol.appendChild(cardsContainer);

    // Quantity Selector
    const qtySec = document.createElement("div");
    qtySec.style.cssText =
      "display: flex; flex-direction: column; gap: 8px; margin-top: 5px;";
    qtySec.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 600;">
        <span style="color: var(--color-gold); letter-spacing: 1px;">QUANTITY TO PROCESS:</span>
        <span style="color: #e0e5f5;">Cargo Ore: <strong style="color: var(--color-cyan);">${oreQty} t</strong></span>
      </div>
    `;

    const controlsRow = document.createElement("div");
    controlsRow.style.cssText = "display: flex; gap: 8px; align-items: center;";

    const btnMin = document.createElement("button");
    btnMin.className = "btn-sm";
    btnMin.innerText = "MIN";
    btnMin.style.cssText = "min-width: 45px; border-radius: 4px;";
    btnMin.disabled = maxRefine <= 0;
    btnMin.addEventListener("click", () => {
      this._refineryQty = maxRefine > 0 ? ratio : 0;
      this.renderRefinery();
    });

    const btnDec = document.createElement("button");
    btnDec.className = "btn-sm";
    btnDec.innerText = "-";
    btnDec.style.cssText =
      "min-width: 35px; font-weight: bold; border-radius: 4px;";
    btnDec.disabled = qty <= ratio;
    btnDec.addEventListener("click", () => {
      this._refineryQty = Math.max(ratio, qty - ratio);
      this.renderRefinery();
    });

    const qtyDisplay = document.createElement("div");
    qtyDisplay.style.cssText = `
      flex: 1;
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      text-align: center;
      font-weight: bold;
      font-size: 14px;
      color: var(--color-cyan);
    `;
    qtyDisplay.innerText = `${qty} t`;

    const btnInc = document.createElement("button");
    btnInc.className = "btn-sm";
    btnInc.innerText = "+";
    btnInc.style.cssText =
      "min-width: 35px; font-weight: bold; border-radius: 4px;";
    btnInc.disabled = qty + ratio > maxRefine;
    btnInc.addEventListener("click", () => {
      this._refineryQty = Math.min(maxRefine, qty + ratio);
      this.renderRefinery();
    });

    const btnMax = document.createElement("button");
    btnMax.className = "btn-sm";
    btnMax.innerText = "MAX";
    btnMax.style.cssText = "min-width: 45px; border-radius: 4px;";
    btnMax.disabled = maxRefine <= 0 || qty === maxRefine;
    btnMax.addEventListener("click", () => {
      this._refineryQty = maxRefine;
      this.renderRefinery();
    });

    controlsRow.appendChild(btnMin);
    controlsRow.appendChild(btnDec);
    controlsRow.appendChild(qtyDisplay);
    controlsRow.appendChild(btnInc);
    controlsRow.appendChild(btnMax);
    qtySec.appendChild(controlsRow);
    leftCol.appendChild(qtySec);
    container.appendChild(leftCol);

    // Right Column: Summary Card
    const rightCol = document.createElement("div");
    rightCol.className = "refinery-summary glass-panel";
    rightCol.style.cssText = `
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 15px;
      background: rgba(0, 242, 254, 0.02);
      border: 1px solid rgba(0, 242, 254, 0.1);
      border-radius: 8px;
    `;

    const sumTop = document.createElement("div");
    sumTop.innerHTML = `
      <h4 style="font-family: var(--font-display); font-size: 12px; font-weight: 700; color: var(--color-gold); margin: 0 0 12px 0; letter-spacing: 1px;">TRANSACTION SUMMARY</h4>
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #a0a5b5;">Raw Ore Consumed:</span>
          <span style="color: var(--color-red); font-weight: 600;">-${qty} t</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #a0a5b5;">Refined ${target.toUpperCase()} Yield:</span>
          <span style="color: var(--color-green); font-weight: 600;">+${produced} t</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px; margin-top: 4px;">
          <span style="color: #a0a5b5;">Est. Processing Fee:</span>
          <span style="color: var(--color-cyan); font-weight: bold;">${baseFee} CR</span>
        </div>
      </div>
      <div style="font-size: 9px; color: #8a90a0; margin-top: 15px; line-height: 1.4; border-left: 2px solid var(--color-cyan); padding-left: 8px;">
        Friendly faction standings will automatically reduce processing fees up to 20%. Hostile factions apply a surcharge.
      </div>
    `;
    rightCol.appendChild(sumTop);

    // Primary action button
    const btnRefine = document.createElement("button");
    btnRefine.className = "btn-primary btn-block";
    btnRefine.style.cssText =
      "margin-top: 15px; padding: 10px; border-radius: 6px; font-weight: bold;";

    // Check afford and inventory conditions
    const canAfford = playerCredits >= baseFee;
    const hasOre = qty > 0;

    if (!hasOre) {
      btnRefine.disabled = true;
      btnRefine.innerText = "NO ORE IN HOLD";
    } else if (!canAfford) {
      btnRefine.disabled = true;
      btnRefine.innerText = `INSUFFICIENT CREDITS (NEEDS ${baseFee} CR)`;
    } else {
      btnRefine.innerText = "EXECUTE REFINING PROCESS";
      btnRefine.addEventListener("click", () => {
        if (window.network) {
          if (window.network.connected) {
            window.network.requestRefine(qty, target);
          } else {
            this.ui.notify(
              "Neural link offline! Cannot perform transactions.",
              "error",
            );
          }
          return;
        }

        // Offline logic
        const res = applyRefine(
          this.player,
          this.planet,
          qty,
          {},
          null,
          null,
          target,
        );

        if (res.ok) {
          this.ui.notify(
            `Refined ${res.refined} t of raw ore into ${res.produced} t of ${target} for ${res.cost} CR.`,
            "success",
          );
          this._refineryQty = 0; // reset
          this.refreshUI();
          this.renderRefinery();
        } else {
          this.ui.notify(
            `Refinement failed: ${res.reason.replace(/_/g, " ")}`,
            "error",
          );
        }
      });
    }

    rightCol.appendChild(btnRefine);
    container.appendChild(rightCol);
    this.paneRefinery.appendChild(container);
  }

  /**
   * Triggers refreshing UI statistics on HUD overlays.
   */
  refreshUI() {
    this.ui.update(this.player, null, [this.planet]);
    // Also explicitly force update active mission HUD list
    if (typeof this.ui.updateActiveMissionsHUD === "function") {
      this.ui.updateActiveMissionsHUD(this.missionManager.activeMissions);
    }
  }

  /**
   * Refreshes the currently active tab pane (used when server reports updates).
   */
  refreshActiveTab() {
    if (!this.overlay || !this.overlay.classList.contains("visible")) return;
    if (this.tabTrade?.classList.contains("active")) this.renderTrade();
    else if (this.tabOutfitter?.classList.contains("active"))
      this.renderOutfitter();
    else if (this.tabShipyard?.classList.contains("active"))
      this.renderShipyard();
    else if (this.tabMissions?.classList.contains("active"))
      this.renderMissions();
    else if (this.tabRefinery?.classList.contains("active"))
      this.renderRefinery();
  }
}
