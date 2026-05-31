# SPEC-110: Server.js Handler Extraction Round 5 — Squad, Escort & Tutorial Handlers

## Summary
Continue the `server.js` monolith decomposition by extracting remaining inline gameplay message handlers into tested modules under `src/server/`. Target handlers: squad management (`squad_invite`, `squad_join`, `squad_leave`), wingman/escort commands (`escort_command`, `escort_formation`), and onboarding tutorial (`tutorial_complete`). This will reduce `server.js` toward the 1,900 LOC range.

## Motivation
- GOAL.md: "`src/server.js` trends toward a thin composition root"
- Decoupling these handlers makes them independently unit-testable and allows server.js to focus strictly on networking and tick scheduling.
- Eliminates inline complexity and local variables from the main WebSocket dispatch loop.

## Scope
**In:**
- Extract `squad_invite`, `squad_join`, `squad_leave` handlers into `src/server/squadHandlers.js`
- Extract `escort_command`, `escort_formation` handlers into `src/server/escortHandlers.js`
- Extract `tutorial_complete` handler into `src/server/tutorialHandlers.js`
- Wire extracted modules into `src/server.js` as function imports
- Write unit tests for each extracted handler module
- Maintain complete backward compatibility (no functional behavior changes)

**Out:**
- Extracting connection or disconnection setup (complex, deferred)
- Changes to matchmaking room routing

## Files
- `src/server.js` (modify)
- `src/server/squadHandlers.js` (create)
- `src/server/squadHandlers.test.js` (create)
- `src/server/escortHandlers.js` (create)
- `src/server/escortHandlers.test.js` (create)
- `src/server/tutorialHandlers.js` (create)
- `src/server/tutorialHandlers.test.js` (create)

## Acceptance Criteria
- [ ] `src/server.js` reduced by 250+ LOC
- [ ] Each extracted handler has independent unit tests with 100% green verification
- [ ] `npm run agent:check` green
