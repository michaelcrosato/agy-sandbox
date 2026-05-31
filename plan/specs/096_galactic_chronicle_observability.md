# SPEC-096 — Observability: The Galactic Chronicle & Dynamic Event Ledger

- **Status:** Todo
- **Wave:** v22 — Phase 1
- **Priority:** Medium
- **Product Pillar:** P1 — Persistent Living Universe / P2 — Emergent Economy (Observability)

## Problem

A core pillar of our persistent space simulation is that "the server dreams"—meaning the galaxy evolves dynamically offline. However, there is no persistent, player-readable record (causal history ledger) detailing why the galaxy changed (e.g. why Ore prices suddenly skyrocketed on Planet X, or why local security patrols have become hostile). We need a persistent `GalacticChronicle` ledger recording historical events and exposing them on a dynamic dashboard visual timeline.

## Scope

### In

- **Chronicle Subsystem (`src/persistence/GalacticChronicle.js`):** Implement a persistent ledger class that:
  - Records major events with detailed JSON metadata (timestamp, sector, category, title, description, and impact metrics).
  - Automatically saves chronicle history to `data/chronicle.json` using the active `Store` wrapper.
  - Automatically prunes logs beyond a maximum history capacity (e.g. 200 events) to maintain a lean storage footprint.
- **Server Hooks:** Wire event logging into:
  - Economy normalizer (market shortages, surplus events).
  - Faction battles and stargate interdictions.
- **Observability Endpoint:** Expose chronicle data at `GET /chronicle` and render as a futuristic, neon-gold glassmorphic timeline sidebar inside `dashboard.html`.

### Out

- **Dynamic chat logging:** The chronicle is strictly for macro simulation events, not transient player chat logs.

## Acceptance Criteria

- [ ] `src/persistence/GalacticChronicle.js` records, persists, and prunes chronicle records deterministically.
- [ ] Major economic changes (surpluses, shortages) register in the chronicle ledger automatically.
- [ ] Timeline panel in `dashboard.html` successfully displays chronicle event details dynamically.
- [ ] 100% Jest unit coverage verifying the save/load/pruning operations.

## Verification Commands

```bash
npm test -- src/persistence/GalacticChronicle.test.js
```
