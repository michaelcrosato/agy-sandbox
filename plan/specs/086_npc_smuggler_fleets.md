# SPEC-086 — NPC Smuggler Fleets & Underworld Trader AI

- **Status:** Todo
- **Wave:** v19 — Phase 1
- **Priority:** High
- **Product Pillar:** P5 — Goal-Driven NPCs (NPC Smuggler Fleets)

## Problem

Currently, NPC merchant ships run standard trade routes with flat cargo profiles and do not interact with the outlaw economy. To make the galaxy feel dangerous and alive, we need to introduce dedicated NPC Smuggler ships that procedurally trade contraband between Rogue's Hollow and major systems, dodging space patrols and utilizing custom evasion maneuvers.

## Scope

### In

- **Smuggler AI Attribute:** Add an `isSmuggler` boolean attribute in `AIController` constructor.
- **Contraband Cargo Planning:** Smuggler AI periodically selects high-value contraband commodities (e.g., weapons, drugs) and paths routes specifically targeting Rogue's Hollow (Black Market spaceport) or major system ports.
- **Evasion & Jamming FSM States:** 
  - Add an `ESCAPE_SECURITY` utility goal in `AIController.js` that triggers when a security patrol ship (Federation or Frontier League Navy) is within 600 units and actively targets/scans the smuggler.
  - In `ESCAPE_SECURITY` state, the smuggler disables weapon firing, activates a simulated "Decoy Jammer" (affecting scanner visibility or adding custom visual particles), and targets the nearest stargate or warp point to jump out.
- **Testing:** Unit tests verifying smuggling goal selections, FSM state transitions, and cargo loading.

### Out

- **Player Decoy Jammers:** The decoy jammer is an exclusive AI capability for smuggler ships in this wave; player outfitting items for jammers remain out-of-scope.
- **Inter-sector jump simulations:** NPC warp jumps between sectors can teleport the smuggler instantly, matching existing stargate travel routines.

## Acceptance Criteria

- [ ] Smuggler NPC ships procedurally load contraband cargo when docked at Rogue's Hollow or outlaw trading ports.
- [ ] Security scan detection triggers the `ESCAPE_SECURITY` goal in `AIController.js` perception.
- [ ] During escape, smugglers ignore hostile firing, maximize thrusters toward the nearest Stargate warp gate, and trigger a custom particle burst representing decoy chaff.
- [ ] 100% green Jest coverage for the new AI smuggler routines.

## Verification Commands

```bash
npm run agent:check
```
