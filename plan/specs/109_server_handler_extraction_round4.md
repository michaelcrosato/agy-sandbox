# SPEC-109: Server.js Handler Extraction Round 4 — Chat, Fleet & Misc Handlers

## Summary
Continue the `server.js` monolith decomposition by extracting remaining inline WebSocket message handlers into tested modules under `src/server/`. Target: reduce `server.js` from ~2,392 LOC toward the 1,800 LOC range by extracting chat, fleet, squad-related, matchmaking, and miscellaneous handlers.

## Motivation
- GOAL.md: "`src/server.js` trends toward a thin composition root"
- Server.js grew back to 2,392 LOC despite spec 103's extraction of 5 action handlers
- Many message handlers remain inline and untested
- Each extraction produces an independently testable module

## Scope
**In:**
- Extract `chat` message handler into `src/server/chatHandler.js`
- Extract `fleet_join`, `fleet_leave`, `fleet_create` handlers into `src/server/fleetHandlers.js`
- Extract `controls`, `land`, `takeoff`, `respawn` handlers into `src/server/gameplayHandlers.js`
- Wire extracted modules into server.js as function imports
- Write unit tests for each extracted handler module
- Ensure backward compatibility (no behavior changes)

**Out:**
- Extracting the physics tick loop or broadcast frame logic
- Extracting the connection/disconnect lifecycle (complex, deferred)
- Any behavior changes

## Files
- `src/server.js` (modify — replace inline handlers with imports)
- `src/server/chatHandler.js` (create)
- `src/server/fleetHandlers.js` (create)
- `src/server/gameplayHandlers.js` (create)
- `src/server/chatHandler.test.js` (create)
- `src/server/fleetHandlers.test.js` (create)
- `src/server/gameplayHandlers.test.js` (create)

## Acceptance Criteria
- [ ] server.js reduced by 300+ LOC
- [ ] Each extracted handler has independent unit tests
- [ ] `npm run agent:check` green
