# SPEC-105 — Interactive Neon Onboarding Tutorial & Cockpit HUD Guide

- **Status:** Approved / Todo
- **Wave:** v25 — Phase 0
- **Priority:** High
- **Product Pillar:** P8 — Presentation & Game Feel

## Problem

A major product frontier is **P8 — Presentation & Game Feel**. Currently, there is no in-game tutorial or onboarding flow for new players. A first-time pilot is dropped directly into the void with zero context or guidance on basic operations (thrusters, targeting, stargate jumps, docking, and market trading). To achieve "frontier quality" and let any stranger fly, dock, and trade within 60 seconds, we need an interactive, aesthetically stunning, step-by-step Cockpit Tutorial that guides pilots through core operations with responsive HUD overlays, and rewards completion with bonus credits to engage in the emergent economy.

## Scope

### In

- **Interactive Tutorial FSM (`src/client/TutorialManager.js`):**
  - Implement a client-side state machine managing a 5-step tutorial sequence:
    - **Step 1: Thrusters & Agility:** Rotate and accelerate using keys to prove movement mastery.
    - **Step 2: Stargate Target Lock:** Target the nearest stargate in the sector to engage the HUD's purple holographic brackets.
    - **Step 3: Sector Warp Jump:** Travel through the stargate to warp to an adjacent sector.
    - **Step 4: Station Docking:** Fly near the sector's trading spaceport and execute docking (`D` key).
    - **Step 5: Faction Trading:** Open the spaceport market and complete a commodity purchase or sale.
  - Dynamically render beautiful, glowing gold/cyan glassmorphic dialog cards with responsive step instructions on top of the cockpit layout.
- **Dynamic HUD Bracket Highlighting:**
  - Wire highlights inside `src/client/CanvasRenderer.js` and `src/client/UIController.js` to draw pulsing, animated neon-cyan focus brackets around key indicators (e.g. active speed indicator, target lock panel, trade panel) matching the active step.
- **Server Persistence & Rewards (`src/server.js`):**
  - Expose a minimal client-triggered server message `tutorial_complete` that persists the completed state on the player profile.
  - Award the player **500 CR** upon completion, issuing a success notification, updating standings influence nudge, and saving to disk.
- **Verification & Testing:**
  - Build `src/client/__tests/TutorialManager.test.js` under Vitest client tests to verify the complete step transition logic and key-press tracking.
  - Build mock socket integration testing for the server-side reward flow.

### Out

- **Enforced linear lockouts:** Players can dismiss or bypass the tutorial at any time.

## Acceptance Criteria

- [ ] `src/client/TutorialManager.js` is implemented and exports a clean FSM tracking movement, targeting, warp, docking, and trade steps.
- [ ] Visual HUD highlight brackets are drawn dynamically during the tutorial around the active panel focus.
- [ ] Server successfully handles `tutorial_complete` messages, validates single-reward bounds, persists the completion, and awards 500 CR.
- [ ] Unit tests for `TutorialManager.js` are fully written and pass.
- [ ] Full Jest and Vitest suites remain 100% green.

## Verification Commands

```bash
npm run agent:check
```
