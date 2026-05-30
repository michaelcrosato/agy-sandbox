# SPEC-100 — Outfit: Ship Fittings Presets & Loadout Manager

- **Status:** Todo
- **Wave:** v23 — Phase 2
- **Priority:** High
- **Product Pillar:** P6 — Ship Identity & Fleet Command

## Problem

Starfall players must purchase, install, and adjust ship outfitting components slot-by-slot. There is currently no option to save a preferred build, share configurations, or buy/equip a comprehensive fittings set in a single action, which degrades outfitting convenience under fast-paced faction combat gameplay.

## Scope

### In

- **Loadout Presets Manager (`src/engine/LoadoutManager.js`):**
  - Track, save, and load named ship outfitting loadout configurations (presets) for players.
  - Implement dynamic validation checks ensuring that presets do not exceed a ship's current slot configurations, power constraints, or mass limits.
  - Support automatic purchasing: a player can purchase a full preset's missing pieces from a port in a single operation, applying correct local tax, faction standings discounts, and stock levels.
- **Client integration:**
  - Build a sleek, responsive loadout preset panel inside the spaceport outfitting UI in `dashboard.html`/`index.html` allowing players to name, save, and purchase preset configurations.
- **Tests:**
  - Robust Jest unit and integration coverage for validation bounds, cost calculations, slot configurations, and invalid component rejections.

### Out

- **Dynamic server-side ship conversions:** Preset configurations apply strictly to standard outfitting items and weapon mounts, not altering the base ship hull archetype.

## Acceptance Criteria

- [ ] `LoadoutManager` successfully saves, loads, validates, and calculates total package costs for outfitting presets.
- [ ] Outfitting presets reject invalid configurations exceeding power grid or slot limits.
- [ ] Full Jest coverage validating outfitting calculations, purchase limits, and validation rejections.

## Verification Commands

```bash
npm test -- src/engine/LoadoutManager.test.js
```
