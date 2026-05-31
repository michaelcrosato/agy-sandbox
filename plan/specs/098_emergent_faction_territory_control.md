# SPEC-098 — Faction: Emergent Faction Territory Control & Dynamic Sector Borders

- **Status:** Completed
- **Wave:** v23 — Phase 1
- **Priority:** High
- **Product Pillar:** P3 — Faction & Reputation Web / emergence

## Problem

Factions inside Starfall have static sector boundaries and sector control assignments. Conflict zones spawn dynamically, but sector ownership never changes, faction influence never shifts, and tax/security levels are entirely hardcoded. To raise the sandbox to frontier emergence quality, we need an active Faction Territory Control subsystem that allows sectors to change hands based on combat outcomes, mission completions, and player standing actions.

## Scope

### In

- **Territory Control System (`src/engine/TerritoryControl.js`):**
  - Track influence scores (0 to 100) for all factions within each sector.
  - Automatically decay influence over time and shift control when a rival faction's influence surpasses the owner by a defined threshold (e.g. influence differential > 10).
  - Dynamically recalculate sector parameters (security rating, tax rate surcharge, local police spawn rate) based on the current controlling faction.
- **Simulation Loops & Hook Integrations:**
  - Hook economic tick and mission completion handlers to reward/deprecate influence.
  - Wire combat and bounty completions to shift sector influence.
- **Client Visualization:**
  - Color-code sector borders and render faction control flags/influence bars inside the NAV overlays and HUD dashboard.

### Out

- **Dynamic map structural changes:** Sectors themselves (coordinates/stargates) remain structurally stable; only faction control, security levels, and associated rates mutate dynamically.

## Acceptance Criteria

- [ ] `TerritoryControl` successfully manages, loads, saves, and updates influence maps per sector.
- [ ] Sector ownership dynamically changes when influence thresholds are crossed, automatically adjusting sector tax and security.
- [ ] Complete Jest coverage validating math limits, decays, ownership thresholds, and event callbacks.

## Verification Commands

```bash
npm test -- src/engine/TerritoryControl.test.js
```
