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

    this.paneTrade = document.getElementById("pane-trade");
    this.paneMissions = document.getElementById("pane-missions");
    this.paneOutfitter = document.getElementById("pane-outfitter");
    this.paneShipyard = document.getElementById("pane-shipyard");

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

  /**
   * Changes the visible menu pane.
   * @param {string} pane - "trade", "missions", "outfitter", or "shipyard".
   */
  switchTab(pane) {
    // Reset active indicators
    this.tabTrade?.classList.remove("active");
    this.tabMissions?.classList.remove("active");
    this.tabOutfitter?.classList.remove("active");
    this.tabShipyard?.classList.remove("active");

    this.paneTrade?.classList.remove("active");
    this.paneMissions?.classList.remove("active");
    this.paneOutfitter?.classList.remove("active");
    this.paneShipyard?.classList.remove("active");

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
    }
  }

  /**
   * Displays the spaceport deck window.
   * @param {Ship} player - Player entity.
   * @param {Planet} planet - Planet entity.
   * @param {Array<Planet>} allPlanets - List of all planets.
   */
  open(player, planet, allPlanets = []) {
    this.player = player;
    this.planet = planet;
    this.allPlanets = allPlanets;

    if (this.overlay) {
      this.overlay.classList.add("visible");
    }

    if (this.title) this.title.innerText = planet.name.toUpperCase();
    if (this.desc) this.desc.innerText = planet.description;

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

    for (const item of commodities) {
      const price = this.planet.market[item];
      const playerQty = this.player.cargo[item] || 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="capitalize">${item}</td>
        <td>${price} CR</td>
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
            this.ui.notify("Neural link offline! Cannot perform transactions.", "error");
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
            this.ui.notify("Neural link offline! Cannot perform transactions.", "error");
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
            this.ui.notify("Neural link offline! Cannot upgrade ship.", "error");
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
            this.ui.notify("Neural link offline! Shipyard services unavailable.", "error");
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

    // Generate available missions dynamically if none exists for this planet yet
    if (!this.missionManager.availableMissions[this.planet.name]) {
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
                this.ui.notify("Neural link offline! Cannot accept contracts.", "error");
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
                this.ui.notify("Neural link offline! Cannot abandon contracts.", "error");
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
    else if (this.tabOutfitter?.classList.contains("active")) this.renderOutfitter();
    else if (this.tabShipyard?.classList.contains("active")) this.renderShipyard();
    else if (this.tabMissions?.classList.contains("active")) this.renderMissions();
  }
}
