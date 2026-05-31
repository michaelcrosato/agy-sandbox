# SPEC-103 — Modularize WebSocket Action Handlers

- **Status:** Approved / Completed
- **Wave:** v24 — Phase 0
- **Priority:** High
- **Product Pillar:** P7 — Netcode & Scale

## Problem

The monolith server composition root `src/server.js` contains over 2,900 lines of code, with several complex WebSocket message handlers (`trade`, `port_service`, `jettison`, `warp_jump`, and `boarding_action`) implemented inline. This inline implementation increases cognitive complexity, makes unit testing difficult, and makes the composition root prone to regression bugs.

## Scope

### In

- **Action Handlers Module (`src/server/actionHandlers.js`):**
  - Extract the inline handlers for the following WebSocket messages from `src/server.js`:
    - `trade` -> `handleTrade(clientObj, msg, room)`
    - `port_service` -> `handlePortService(clientObj, msg, room)`
    - `jettison` -> `handleJettison(clientObj, msg, room)`
    - `warp_jump` -> `handleWarpJump(clientObj, msg, room)`
    - `boarding_action` -> `handleBoardingAction(clientObj, msg, room)`
  - Keep the logic, parameters, and behaviors identical to the current inline implementations.
- **Server Integration (`src/server.js`):**
  - Import the new action handlers from `src/server/actionHandlers.js`.
  - Wire them directly into the WebSocket `type === ...` dispatch block to replace the inline logic.
- **Testing:**
  - Create `src/server/actionHandlers.test.js` to verify the extracted logic using mocked connections, clients, and room objects.
  - Maintain 100% green test passes across all 91 test suites.

### Out

- **Restructuring of internal handler states:** The logic must remain functionally identical to ensure backward-compatibility.

## Acceptance Criteria

- [x] `src/server/actionHandlers.js` is created and contains clean, exported handlers for `trade`, `port_service`, `jettison`, `warp_jump`, and `boarding_action`.
- [x] `src/server.js` is successfully refactored, reducing its total line count by 450+ LOC, with all 5 types wired to the new action handlers.
- [x] `src/server/actionHandlers.test.js` exists and comprehensively exercises each of the 5 extracted handlers under mock connections.
- [x] The full Jest test suite (`npm run agent:check`) is 100% green.

## Verification Commands

```bash
npm test -- src/server/actionHandlers.test.js
```
