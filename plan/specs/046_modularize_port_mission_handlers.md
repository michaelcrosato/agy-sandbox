# SPEC-046 — Modularize Port & Mission Handlers

## Description
`src/server.js` is still the single largest file and contains inline handlers for purchasing and selling outfits, buying ships, accepting missions, and completing missions. Because these handlers are directly embedded within the Socket connection loop, they have no dedicated unit tests. This poses high regression risks during changes.

This specification extracts these port transaction and mission management message handlers into a clean, testable sub-module:
- `src/server/portHandlers.js` which exports clean, pure/decoupled handlers for buying/selling outfits, buying ships, and accepting/completing missions.
- `src/server/portHandlers.test.js` which houses isolated, deterministic unit and mock socket tests for all extracted message handlers.

## Definition of Done (DoD)
- [ ] Create `src/server/portHandlers.js` containing the extracted outfitting, shipyard, and mission transition handlers.
- [ ] Ensure that `src/server.js` imports these handlers and delegates to them, achieving identical byte-level transaction behavior.
- [ ] Reduce the line count of the `server.js` monolith by at least 150 lines.
- [ ] Create `src/server/portHandlers.test.js` housing deterministic, mock-connection tests for all transaction pathways, covering both successful runs and failure bounds (insufficient credits, cargo capacity limits, missing requisites).
- [ ] Verify that the server successfully boots and all 800+ Jest tests pass cleanly.

## Implementation Approach
- Extract the following WS handlers:
  - `outfit_buy`, `outfit_sell`
  - `ship_buy`
  - `mission_accept`, `mission_complete`
- Place them in `src/server/portHandlers.js` as parameterized functions:
  ```javascript
  export function handleOutfitBuy(clientObj, outfitName, targetPlanet) { ... }
  export function handleShipBuy(clientObj, shipType, targetPlanet) { ... }
  export function handleMissionAccept(clientObj, missionId, targetPlanet) { ... }
  ```
- Import these back into `src/server.js` message router.
- Ensure that we utilize mock `clientObj` and mock `targetPlanet` structures in `portHandlers.test.js` to easily test edge cases headlessly.

## Test Strategy
- Isolated tests inside `src/server/portHandlers.test.js` verifying:
  - Valid outfit buy increases ship outfits and decreases player credits.
  - Insufficient credits triggers correct ws error messages.
  - Valid ship buy transfers cargo, credits, and updates ship stats.
- Run validation pipeline:
  `npm run agent:check`
