import {
  applyRefine,
  refineCost,
  getNavalRank,
  redeemFactionVouchers,
} from "../engine/PortServices.js";
import { DEFAULT_OUTFITS } from "../engine/outfitCatalog.js";
import { getOutfitCategory } from "../engine/Outfitting.js";
import { BASE_MARKETS } from "../net/SchemaRegistry.js";

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
    this.tabNaval = document.getElementById("tab-naval");

    this.paneTrade = document.getElementById("pane-trade");
    this.paneMissions = document.getElementById("pane-missions");
    this.paneOutfitter = document.getElementById("pane-outfitter");
    this.paneShipyard = document.getElementById("pane-shipyard");
    this.paneRefinery = document.getElementById("pane-refinery");
    this.paneNaval = document.getElementById("pane-naval");

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
    this.tabNaval?.addEventListener("click", () => this.switchTab("naval"));

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
    this.tabNaval?.classList.remove("active");

    this.paneTrade?.classList.remove("active");
    this.paneMissions?.classList.remove("active");
    this.paneOutfitter?.classList.remove("active");
    this.paneShipyard?.classList.remove("active");
    this.paneRefinery?.classList.remove("active");
    this.paneNaval?.classList.remove("active");

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
    } else if (pane === "naval") {
      this.tabNaval?.classList.add("active");
      this.paneNaval?.classList.add("active");
      this.renderNaval();
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

    // Show/hide naval tab based on whether planet faction is a major one
    if (this.tabNaval) {
      const majorFactions = ["Federation", "Frontier League", "Pirates"];
      if (planet.faction && majorFactions.includes(planet.faction)) {
        this.tabNaval.style.display = "block";
      } else {
        this.tabNaval.style.display = "none";
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

    // Client baseline market index imported from SchemaRegistry
    const baseMarkets = BASE_MARKETS;

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
  /**
   * Renders the outfitter shop panel.
   */
  renderOutfitter() {
    if (!this.paneOutfitter || !this.player || !this.planet) return;

    this.paneOutfitter.innerHTML = `
      <style>
        .outfitter-dashboard {
          display: flex;
          gap: 20px;
          height: 100%;
          width: 100%;
          font-family: 'Inter', sans-serif;
        }
        .fittings-panel {
          flex: 1;
          background: rgba(25, 35, 60, 0.4);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: #e0e5f5;
        }
        .store-panel {
          flex: 1.2;
          background: rgba(25, 35, 60, 0.2);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
          max-height: 550px;
        }
        .dashboard-title {
          font-size: 14px;
          font-weight: 700;
          color: #38bdf8;
          text-transform: uppercase;
          letter-spacing: 1px;
          border-bottom: 1px solid rgba(56, 189, 248, 0.2);
          padding-bottom: 6px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .fittings-slots {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fit-slot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          transition: all 0.2s ease;
        }
        .fit-slot.equipped {
          background: rgba(56, 189, 248, 0.05);
          border: 1px solid rgba(56, 189, 248, 0.2);
        }
        .slot-label {
          color: #8fa0c0;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.5px;
          width: 100px;
        }
        .slot-val {
          flex-grow: 1;
          color: #ffffff;
          font-weight: 500;
        }
        .slot-val.empty {
          color: #4b5563;
          font-style: italic;
        }
        .performance-hud {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 12px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          font-size: 11px;
        }
        .hud-stat-label {
          color: #a3a3a3;
        }
        .hud-stat-val {
          color: #ffffff;
          font-weight: 700;
          text-align: right;
        }
        .presets-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: auto;
        }
        .preset-slot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 11px;
        }
        .preset-name {
          color: #e2e8f0;
          font-weight: 600;
        }
        .preset-summary {
          font-size: 9px;
          color: #64748b;
          margin-top: 2px;
          max-width: 150px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .preset-actions {
          display: flex;
          gap: 6px;
        }
        .preset-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 600;
          color: #ffffff;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .preset-btn:hover {
          background: rgba(56, 189, 248, 0.2);
          border-color: #38bdf8;
        }
        .preset-btn.btn-load {
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
        }
        .preset-btn.btn-load:hover {
          background: #38bdf8;
          color: #000;
        }
        .sell-btn {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 9px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sell-btn:hover {
          background: #ef4444;
          color: #ffffff;
        }
        .store-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .store-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
        }
        .store-card:hover {
          border-color: rgba(56, 189, 248, 0.3);
          background: rgba(255, 255, 255, 0.03);
        }
        .store-card-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 70%;
        }
        .store-card-name {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
        }
        .store-card-desc {
          font-size: 10px;
          color: #94a3b8;
          line-height: 1.3;
        }
        .store-card-meta {
          font-size: 9px;
          color: #38bdf8;
          font-weight: 600;
          text-transform: uppercase;
        }
        .store-card-action {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .store-card-cost {
          font-weight: 700;
          color: #fbbf24;
          font-size: 12px;
        }
        .purchase-btn {
          background: #38bdf8;
          color: #000000;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .purchase-btn:hover {
          background: #0ea5e9;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
        }
        .purchase-btn:disabled {
          background: rgba(255, 255, 255, 0.05);
          color: #4b5563;
          cursor: not-allowed;
          box-shadow: none;
        }
      </style>
      <div class="outfitter-dashboard">
        <!-- LEFT: STARSHIP FITTINGS HUD + PRESETS -->
        <div class="fittings-panel">
          <div class="dashboard-title">Starship Fittings</div>
          
          <div class="fittings-slots" id="fittings-slots-list">
            <!-- Dynamically rendered slots -->
          </div>

          <div class="dashboard-title">Performance Diagnostics</div>
          <div class="performance-hud">
            <span class="hud-stat-label">Chassis Agility (Mass):</span>
            <span class="hud-stat-val" id="perf-mass">0 kg</span>
            <span class="hud-stat-label">Maximum Velocity:</span>
            <span class="hud-stat-val" id="perf-speed">0 units/s</span>
            <span class="hud-stat-label">Shield Integrity:</span>
            <span class="hud-stat-val" id="perf-shield">0 GW</span>
            <span class="hud-stat-label">Weapon Output Boost:</span>
            <span class="hud-stat-val" id="perf-weapon">+0 MW</span>
          </div>

          <div class="presets-section">
            <div class="dashboard-title">Loadout Presets</div>
            <div id="presets-list">
              <!-- Presets slots -->
            </div>
          </div>
        </div>

        <!-- RIGHT: PLANETARY OUTFITTING STORE -->
        <div class="store-panel">
          <div class="dashboard-title">
            <span>Planetary Outfitter</span>
            <span style="font-size: 11px; color: #fbbf24;" id="player-outfitter-credits">Credits: 0 CR</span>
          </div>
          <div class="store-grid" id="store-outfit-list">
            <!-- Available outfits -->
          </div>
        </div>
      </div>
    `;

    const currentOutfits = [...this.player.outfits];
    const equippedWeapons = [];
    const equippedShields = [];
    const equippedUtilities = [];
    const equippedGenerals = [];

    for (const name of currentOutfits) {
      if (name === "Basic Laser") {
        equippedWeapons.push(name);
        continue;
      }
      const config = DEFAULT_OUTFITS.find((o) => o.name === name);
      if (config) {
        const category = getOutfitCategory(config.type);
        if (category === "weapon") equippedWeapons.push(name);
        else if (category === "shield") equippedShields.push(name);
        else if (category === "utility") equippedUtilities.push(name);
        else equippedGenerals.push(name);
      } else {
        equippedGenerals.push(name);
      }
    }

    const slotsList = this.paneOutfitter.querySelector("#fittings-slots-list");
    slotsList.innerHTML = "";

    const renderSlot = (slotLabel, outfitName) => {
      const isEquipped = !!outfitName;
      const div = document.createElement("div");
      div.className = `fit-slot ${isEquipped ? "equipped" : ""}`;
      div.innerHTML = `
        <span class="slot-label">${slotLabel}</span>
        <span class="slot-val ${isEquipped ? "" : "empty"}">${outfitName || "Empty Slot"}</span>
        ${isEquipped ? `<button class="sell-btn" data-outfit="${outfitName}">SELL (90%)</button>` : ""}
      `;
      if (isEquipped) {
        div.querySelector(".sell-btn").addEventListener("click", () => {
          if (window.network && window.network.connected) {
            window.network.requestOutfitSell(outfitName);
            setTimeout(() => this.renderOutfitter(), 250);
          } else {
            // Local offline fallback
            const idx = this.player.outfits.indexOf(outfitName);
            if (idx !== -1) {
              this.player.outfits.splice(idx, 1);
              let outfitConfig = DEFAULT_OUTFITS.find(
                (o) => o.name === outfitName,
              );
              if (!outfitConfig && outfitName === "Basic Laser") {
                outfitConfig = {
                  name: "Basic Laser",
                  cost: 0,
                  type: "weapon",
                  value: 0,
                  mass: 0,
                };
              }
              if (outfitConfig) {
                if (outfitConfig.type === "shield") {
                  this.player.maxShield = Math.max(
                    1,
                    this.player.maxShield - outfitConfig.value,
                  );
                  this.player.shield = Math.min(
                    this.player.shield,
                    this.player.maxShield,
                  );
                } else if (outfitConfig.type === "engine") {
                  this.player.thrustPower = Math.max(
                    0,
                    this.player.thrustPower - outfitConfig.value,
                  );
                  this.player.maxSpeed = Math.max(0, this.player.maxSpeed - 50);
                } else if (outfitConfig.type === "weapon") {
                  this.player.weaponDamage = Math.max(
                    0,
                    this.player.weaponDamage - outfitConfig.value,
                  );
                } else if (outfitConfig.type === "cargo") {
                  this.player.cargoCapacity = Math.max(
                    0,
                    this.player.cargoCapacity - outfitConfig.value,
                  );
                }
                if (
                  outfitConfig.mass &&
                  typeof this.player.removeOutfitMass === "function"
                ) {
                  this.player.removeOutfitMass(outfitConfig.mass);
                }
                this.player.credits += Math.floor(outfitConfig.cost * 0.9);
              }
              this.ui.notify(`Sold: ${outfitName}!`, "success");
              this.refreshUI();
              this.renderOutfitter();
            }
          }
        });
      }
      slotsList.appendChild(div);
    };

    renderSlot("Weapon L", equippedWeapons[0]);
    renderSlot("Weapon R", equippedWeapons[1]);
    renderSlot("Shield S", equippedShields[0]);
    renderSlot("Utility U", equippedUtilities[0]);

    if (equippedGenerals.length > 0) {
      for (const genName of equippedGenerals) {
        renderSlot("General G", genName);
      }
    }

    // Performance diagnostics stats values
    this.paneOutfitter.querySelector("#perf-mass").innerText =
      `${(this.player.mass || 2000).toLocaleString()} kg`;
    this.paneOutfitter.querySelector("#perf-speed").innerText =
      `${this.player.maxSpeed || 300} units/s`;
    this.paneOutfitter.querySelector("#perf-shield").innerText =
      `${this.player.maxShield || 100} GW`;
    this.paneOutfitter.querySelector("#perf-weapon").innerText =
      `+${this.player.weaponDamage || 0} MW`;

    // Presets slots setup
    const presetsList = this.paneOutfitter.querySelector("#presets-list");
    presetsList.innerHTML = "";

    if (!Array.isArray(this.player.presets)) {
      this.player.presets = [null, null, null];
    }

    for (let i = 0; i < 3; i++) {
      const preset = this.player.presets[i];
      const outfits = Array.isArray(preset)
        ? preset
        : preset && preset.outfits
          ? preset.outfits
          : [];
      const presetName =
        preset && typeof preset === "object" && preset.name
          ? preset.name
          : `Preset Slot ${i + 1}`;
      const summaryText =
        outfits.length > 0 ? outfits.join(", ") : "Empty Preset Slot";

      const div = document.createElement("div");
      div.className = "preset-slot";
      div.style.marginBottom = "8px";

      div.innerHTML = `
        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
          <input type="text" class="preset-name-input" placeholder="Preset Name..." value="${presetName}" 
            style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 4px; color: #fff; padding: 2px 8px; font-size: 11px; width: 120px; font-family: inherit;" />
          <div class="preset-summary" title="${summaryText}" style="font-size: 9px; color: #64748b; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${summaryText}</div>
        </div>
        <div class="preset-actions" style="display: flex; gap: 6px;">
          <button class="preset-btn btn-save" data-idx="${i}">SAVE</button>
          <button class="preset-btn btn-load" data-idx="${i}" ${outfits.length > 0 ? "" : "disabled"}>LOAD</button>
        </div>
      `;

      div.querySelector(".btn-save").addEventListener("click", () => {
        const inputName =
          div.querySelector(".preset-name-input").value.trim() ||
          `Preset Slot ${i + 1}`;
        if (window.network && window.network.connected) {
          window.network.requestPresetSave(i, inputName);
          this.player.presets[i] = {
            name: inputName,
            outfits: [...this.player.outfits],
          };
          setTimeout(() => this.renderOutfitter(), 150);
        } else {
          this.player.presets[i] = {
            name: inputName,
            outfits: [...this.player.outfits],
          };
          this.ui.notify(`Saved Preset: "${inputName}"!`, "success");
          this.renderOutfitter();
        }
      });

      if (outfits.length > 0) {
        div.querySelector(".btn-load").addEventListener("click", () => {
          if (window.network && window.network.connected) {
            window.network.requestPresetLoad(i);
            setTimeout(() => this.renderOutfitter(), 250);
          } else {
            // Local offline preset load simulation
            this.player.outfits = [...outfits];
            this.player.maxShield = 100;
            this.player.thrustPower = 10000;
            this.player.maxSpeed = 300;
            this.player.weaponDamage = 0;
            this.player.cargoCapacity = 20;
            this.player.outfitMass = 0;
            this.player.mass = 2000;

            for (const name of outfits) {
              const outfitConfig = DEFAULT_OUTFITS.find((o) => o.name === name);
              if (outfitConfig) {
                if (outfitConfig.type === "shield") {
                  this.player.maxShield += outfitConfig.value;
                } else if (outfitConfig.type === "engine") {
                  this.player.thrustPower += outfitConfig.value;
                  this.player.maxSpeed += 50;
                } else if (outfitConfig.type === "weapon") {
                  this.player.weaponDamage += outfitConfig.value;
                } else if (outfitConfig.type === "cargo") {
                  this.player.cargoCapacity += outfitConfig.value;
                }
                if (
                  outfitConfig.mass &&
                  typeof this.player.addOutfitMass === "function"
                ) {
                  this.player.addOutfitMass(outfitConfig.mass);
                }
              }
            }
            this.player.shield = this.player.maxShield;
            this.ui.notify(`Loaded Preset "${presetName}"!`, "success");
            this.refreshUI();
            this.renderOutfitter();
          }
        });
      }
      presetsList.appendChild(div);
    }

    // Credits & Planetary shop grid rendering
    this.paneOutfitter.querySelector("#player-outfitter-credits").innerText =
      `Credits: ${(this.player.credits || 0).toLocaleString()} CR`;

    const storeList = this.paneOutfitter.querySelector("#store-outfit-list");
    storeList.innerHTML = "";

    for (const outfit of this.planet.outfitter) {
      const hasOutfit = this.player.outfits.includes(outfit.name);
      const descText =
        outfit.description || `High-performance ${outfit.type} module.`;
      const category = getOutfitCategory(outfit.type);

      const div = document.createElement("div");
      div.className = "store-card";
      div.innerHTML = `
        <div class="store-card-info">
          <span class="store-card-name">${outfit.name}</span>
          <span class="store-card-desc">${descText}</span>
          <span class="store-card-meta">Category: ${category} | Mass: ${outfit.mass || 0} kg</span>
        </div>
        <div class="store-card-action">
          <span class="store-card-cost">${outfit.cost.toLocaleString()} CR</span>
          <button class="purchase-btn" ${hasOutfit ? "disabled" : ""}>
            ${hasOutfit ? "EQUIPPED" : "PURCHASE"}
          </button>
        </div>
      `;

      div.querySelector("button").addEventListener("click", () => {
        if (window.network && window.network.connected) {
          window.network.requestOutfitPurchase(outfit.name);
          setTimeout(() => this.renderOutfitter(), 250);
          return;
        }

        if (this.player.credits < outfit.cost) {
          this.ui.notify("Insufficient credits for upgrade!", "error");
          return;
        }

        this.player.credits -= outfit.cost;
        this.player.outfits.push(outfit.name);

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

        if (outfit.mass && typeof this.player.addOutfitMass === "function") {
          this.player.addOutfitMass(outfit.mass);
        }

        this.ui.notify(`Equipped: ${outfit.name}!`, "success");
        this.refreshUI();
        this.renderOutfitter();
      });

      storeList.appendChild(div);
    }
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
    else if (this.tabNaval?.classList.contains("active")) this.renderNaval();
  }

  /**
   * Renders the interactive Naval Command Deck panel.
   */
  renderNaval() {
    if (!this.paneNaval || !this.player || !this.planet) return;

    this.paneNaval.innerHTML = "";

    const standings = this.player.standings || {};
    const standing = standings[this.planet.faction] || 0;
    const currentRank = getNavalRank(standing);

    // Rank milestones
    let nextRank;
    let nextRankReq;
    let prevRankReq;
    if (standing <= -10) {
      nextRank = "RECRUIT";
      nextRankReq = -9;
      prevRankReq = -100;
    } else if (standing < 10) {
      nextRank = "LIEUTENANT";
      nextRankReq = 10;
      prevRankReq = -10;
    } else if (standing < 40) {
      nextRank = "COMMANDER";
      nextRankReq = 40;
      prevRankReq = 10;
    } else if (standing < 80) {
      nextRank = "ADMIRAL";
      nextRankReq = 80;
      prevRankReq = 40;
    } else {
      nextRank = "MAX RANK";
      nextRankReq = 100;
      prevRankReq = 80;
    }

    const range = nextRankReq - prevRankReq;
    const progressPercent = Math.max(
      0,
      Math.min(100, ((standing - prevRankReq) / range) * 100),
    );

    // Calculate vouchers
    const planetFaction = this.planet.faction;
    const vouchers = this.player.bountyVouchers || [];
    const matchingVouchers = vouchers.filter(
      (v) => v.faction === planetFaction,
    );
    const otherVouchers = vouchers.filter((v) => v.faction !== planetFaction);

    const matchingCount = matchingVouchers.length;
    const matchingTotal = matchingVouchers.reduce(
      (sum, v) => sum + (v.value || 0),
      0,
    );

    const isFriendly = standing >= 10;
    const bonusMultiplier = isFriendly ? 0.15 : 0.0;
    const bonusCredits = Math.round(matchingTotal * bonusMultiplier);
    const totalClaimable = matchingTotal + bonusCredits;

    // Build container layout
    const container = document.createElement("div");
    container.className = "naval-container";
    container.style.cssText = `
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 20px;
      padding: 15px;
      color: #e0e5f5;
      font-family: var(--font-body);
    `;

    // Left Column: Faction Status & Rank
    const leftCol = document.createElement("div");
    leftCol.className = "naval-status glass-panel";
    leftCol.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    `;

    // Header with Faction Name & Standing
    const factionColor =
      planetFaction === "Federation"
        ? "var(--color-cyan)"
        : planetFaction === "Frontier League"
          ? "var(--color-gold)"
          : "var(--color-red)";
    leftCol.innerHTML = `
      <div>
        <h3 style="font-family: var(--font-display); font-size: 16px; font-weight: 700; color: ${factionColor}; margin: 0 0 5px 0; letter-spacing: 1px;">
          ${planetFaction.toUpperCase()} NAVAL DIVISION
        </h3>
        <p style="font-size: 11px; color: #a0a5b5; margin: 0; line-height: 1.4;">
          Enlist with the command deck to secure space lanes, claim outlaw bounties, and climb the ranks of the faction navy. High standings unlock premium military equipment.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: rgba(0, 0, 0, 0.2); padding: 15px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.03);">
        <div>
          <div style="font-size: 10px; color: #8a90a0; font-weight: 600; letter-spacing: 1px;">CURRENT RANK</div>
          <div style="font-size: 18px; font-weight: bold; color: #ffffff; font-family: var(--font-display); margin-top: 4px; letter-spacing: 1px;">
            ${currentRank}
          </div>
        </div>
        <div>
          <div style="font-size: 10px; color: #8a90a0; font-weight: 600; letter-spacing: 1px;">FACTION STANDING</div>
          <div style="font-size: 18px; font-weight: bold; color: ${standing >= 0 ? "var(--color-green)" : "var(--color-red)"}; font-family: var(--font-display); margin-top: 4px;">
            ${standing >= 0 ? "+" : ""}${standing.toFixed(1)} Merits
          </div>
        </div>
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; margin-bottom: 8px;">
          <span style="color: #a0a5b5;">Rank Progression: <strong style="color: #ffffff;">${progressPercent.toFixed(0)}%</strong></span>
          <span style="color: var(--color-gold);">${nextRank} (${nextRankReq > 0 ? "+" : ""}${nextRankReq} Req)</span>
        </div>
        <div style="height: 8px; background: rgba(0, 0, 0, 0.4); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.05); position: relative;">
          <div style="height: 100%; width: ${progressPercent}%; background: linear-gradient(90deg, ${factionColor}, #ffffff); transition: width 0.4s ease-out; box-shadow: 0 0 10px ${factionColor};"></div>
        </div>
      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
        <h4 style="font-size: 11px; font-weight: 700; color: var(--color-gold); margin: 0 0 10px 0; letter-spacing: 0.5px;">MILITARY EQUIPMENT UNLOCKS</h4>
        <div style="display: grid; gap: 8px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.01); padding: 6px 10px; border-radius: 4px;">
            <span>🚀 Interceptor (Hull)</span>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 3px; background: ${currentRank !== "OUTLAW" && currentRank !== "RECRUIT" ? "rgba(0, 255, 0, 0.15); color: var(--color-green);" : "rgba(255, 255, 255, 0.05); color: #8a90a0;"}">
              ${currentRank !== "OUTLAW" && currentRank !== "RECRUIT" ? "UNLOCKED" : "LIEUTENANT"}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.01); padding: 6px 10px; border-radius: 4px;">
            <span>⚡ Ion Disruptor Array (Outfit)</span>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 3px; background: ${currentRank !== "OUTLAW" && currentRank !== "RECRUIT" ? "rgba(0, 255, 0, 0.15); color: var(--color-green);" : "rgba(255, 255, 255, 0.05); color: #8a90a0;"}">
              ${currentRank !== "OUTLAW" && currentRank !== "RECRUIT" ? "UNLOCKED" : "LIEUTENANT"}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.01); padding: 6px 10px; border-radius: 4px;">
            <span>🚢 Military Destroyer (Hull)</span>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 3px; background: ${currentRank === "COMMANDER" || currentRank === "ADMIRAL" ? "rgba(0, 255, 0, 0.15); color: var(--color-green);" : "rgba(255, 255, 255, 0.05); color: #8a90a0;"}">
              ${currentRank === "COMMANDER" || currentRank === "ADMIRAL" ? "UNLOCKED" : "COMMANDER"}
            </span>
          </div>
        </div>
      </div>
    `;

    // Right Column: Redemption Card
    const rightCol = document.createElement("div");
    rightCol.className = "naval-redemption glass-panel";
    rightCol.style.cssText = `
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 20px;
      background: rgba(0, 242, 254, 0.02);
      border: 1px solid rgba(0, 242, 254, 0.1);
      border-radius: 8px;
    `;

    const summarySection = document.createElement("div");
    summarySection.innerHTML = `
      <h4 style="font-family: var(--font-display); font-size: 12px; font-weight: 700; color: var(--color-gold); margin: 0 0 15px 0; letter-spacing: 1px;">VOUCHER LEDGER</h4>
      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #a0a5b5;">Unredeemed Slips (${planetFaction}):</span>
          <span style="color: #ffffff; font-weight: 600;">${matchingCount} slip${matchingCount === 1 ? "" : "s"}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #a0a5b5;">Voucher Face Value:</span>
          <span style="color: var(--color-cyan); font-weight: bold;">${matchingTotal.toLocaleString()} CR</span>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 8px; margin-top: 4px;">
          <span style="color: #a0a5b5;">Allied Commendation (15%):</span>
          <span style="font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: bold; background: ${isFriendly ? "rgba(0, 255, 0, 0.15); color: var(--color-green);" : "rgba(255, 255, 255, 0.05); color: #8a90a0;"}">
            ${isFriendly ? "ACTIVE" : "LOCKED"}
          </span>
        </div>

        ${
          isFriendly
            ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #a0a5b5;">Bonus CR:</span>
          <span style="color: var(--color-green); font-weight: 600;">+${bonusCredits.toLocaleString()} CR</span>
        </div>
        `
            : ""
        }

        <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 10px; margin-top: 5px;">
          <span style="color: #ffffff; font-weight: bold; font-size: 12px;">Total Payout:</span>
          <span style="color: var(--color-green); font-weight: bold; font-size: 14px;">${totalClaimable.toLocaleString()} CR</span>
        </div>
      </div>
      
      <div style="font-size: 9px; color: #8a90a0; margin-top: 15px; line-height: 1.4; border-left: 2px solid var(--color-cyan); padding-left: 8px;">
        Bounty vouchers are rewarded upon outlaw neutralizations in this sector. Merit bonuses are awarded at 1 merit point per 1,000 CR value redeemed.
      </div>
    `;

    // Action button
    const btnRedeem = document.createElement("button");
    btnRedeem.className = "btn-primary btn-block";
    btnRedeem.style.cssText =
      "margin-top: 20px; padding: 12px; border-radius: 6px; font-weight: bold; letter-spacing: 1px;";

    if (matchingCount === 0) {
      btnRedeem.disabled = true;
      btnRedeem.innerText = "NO BOUNTIES TO CLAIM";
    } else {
      btnRedeem.innerText = `REDEEM ${matchingCount} VOUCHERS`;
      btnRedeem.addEventListener("click", () => {
        if (window.network) {
          if (window.network.connected) {
            window.network.send({ type: "port_redeem_vouchers" });
          } else {
            this.ui.notify(
              "Neural link offline! Cannot redeem vouchers.",
              "error",
            );
          }
          return;
        }

        // Offline logic
        const res = redeemFactionVouchers(
          this.player,
          planetFaction,
          null,
          null,
        );
        if (res.ok) {
          this.ui.notify(
            `Successfully redeemed ${res.count} Bounty Vouchers for ${res.creditsClaimed.toLocaleString()} CR!`,
            "success",
          );
          this.refreshUI();
          this.renderNaval();
        }
      });
    }

    // Other Factions Vouchers details
    const otherFactionsSection = document.createElement("div");
    otherFactionsSection.style.cssText =
      "border-top: 1px solid rgba(255, 255, 255, 0.05); margin-top: 20px; padding-top: 15px; font-size: 10px; color: #a0a5b5;";
    if (otherVouchers.length > 0) {
      const otherTotals = {};
      for (const v of otherVouchers) {
        otherTotals[v.faction] = (otherTotals[v.faction] || 0) + (v.value || 0);
      }
      let detailsHTML = `<div style="font-weight: bold; margin-bottom: 5px; color: var(--color-gold);">HELD VOUCHERS FOR OTHER FACTIONS:</div>`;
      for (const [fac, val] of Object.entries(otherTotals)) {
        detailsHTML += `<div style="display: flex; justify-content: space-between; margin-top: 3px;">
          <span>• ${fac}:</span>
          <span>${val.toLocaleString()} CR</span>
        </div>`;
      }
      otherFactionsSection.innerHTML = detailsHTML;
    } else {
      otherFactionsSection.innerHTML = `<div style="color: #6a7080; text-align: center;">No vouchers held for other factions.</div>`;
    }

    summarySection.appendChild(btnRedeem);
    summarySection.appendChild(otherFactionsSection);
    rightCol.appendChild(summarySection);

    container.appendChild(leftCol);
    container.appendChild(rightCol);

    this.paneNaval.appendChild(container);
  }
}
