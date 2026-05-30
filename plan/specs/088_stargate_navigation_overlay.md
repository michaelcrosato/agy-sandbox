# SPEC-088 — Stargate Navigation NAV-computer Overlay

- **Status:** Todo
- **Wave:** v19 — Phase 2
- **Priority:** High
- **Product Pillar:** P8 — Presentation & Game Feel (Shortest path overlay)

## Problem

Currently, navigations and warp selections across sectors require players to guess stargate networks or navigate blind. We need to introduce an authoritative gold glassmorphic HUD slide-out NAV-computer panel that automatically computes the shortest path of stargate jumps and highlights target gateways with neon-purple visual rings.

## Scope

### In

- **Holographic HUD Slide-Out Panel:** Add a glowing `#nav-computer-panel` container in `index.html` styled with sleek gold-glassmorphism in `index.css`.
- **Shortest Path BFS Calculations:** Wire the dynamic BFS calculation `calculateShortestPath` directly into UIController's ticking update loops.
- **Route Checkpoint Render:** Render the active step-by-step route checkpoints (e.g., `Sol Prime -> Polaris -> Rogues Hollow`) dynamically on the nav-computer dashboard.
- **Holographic Gateway Rings:** In `CanvasRenderer.js`, draw glowing, neon-purple pulsing dashed holographic brackets around the warp gate that serves as the immediate next step in the computed nav route.
- **Testing:** Vitest logic checks verifying correct UI update ticks and path representations.

### Out

- **Dynamic map nodes editor:** Stargates paths are static mappings between sectors; dynamic network editing is out-of-scope.

## Acceptance Criteria

- [ ] A gorgeous slide-out NAV-computer gold-glassmorphic panel exists in cockpit HUD.
- [ ] Displays active shortest-path warp gate checkpoints computed dynamically between player sector and HUD target sector.
- [ ] The Canvas renders pulsing dashed neon-purple target brackets around the next warp gate in transit.
- [ ] Passing Vitest logic/rendering tests.

## Verification Commands

```bash
npm run test:client
npm run test:client:browser
```
