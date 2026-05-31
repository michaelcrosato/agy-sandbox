# SPEC-076 — Wingman Fleet Command Formations & Cockpit HUD Guides

## Description
This specification implements player wingman escort fleet formation controls and visual overlays (P6). It introduces dedicated client cockpit command keys (F2 for Delta wing formation, F3 for standard Defensive orbit) sending WS events to the server, updates the escort FSM to maintain relative coordinate offsets from flagship players, and renders vector-based wingman target offsets on the client HUD.

1. **Escort Relative Formations:**
   - In `AIController.js`, implement relative offset positioning calculations for wingman escorts based on selected formation state (Delta Wing vs defensive orbit).
   - Wire standard server-side listeners for `"escort_formation"` events, updating escorts' FSM parameters instantly.

2. **Cockpit HUD Vector Overlays:**
   - In `CanvasRenderer.js`, render subtle holographic bounding brackets and dotted vector projection lines linking the player's flagship to active assigned wingmen.

## Definition of Done (DoD)
- [ ] Implement relative offset calculations in `AIController.js` for Delta Wing and orbit formations.
- [ ] Render visual vector brackets connecting flagship players to escorts in `CanvasRenderer.js`.
- [ ] Add unit tests in `src/engine/ai/AIController.test.js` verifying that escorts calculate and transition to relative offset coordinates based on formation command.
- [ ] Gate check `npm run agent:check` passes completely green.

## Implementation Approach
- Add relative coordinate transformations to the escort FSM inside `AIController.js`'s update loop.
- Use `ctx.setLineDash` and a glowing style in the canvas renderer to draw neat, futuristic connection lines to wingmen.

## Test Strategy
- Assert that calling escort AI update under `DELTA` formation yields offset coordinates behind the flagship.
